const DateTime = require('luxon').DateTime;
const CONSTANTS = require('../../config/constants');
const { insertApiLog } = require('../../repositories/log_repository');
const { cacheGet, cacheSet, cacheDel, cacheTtl } = require('../../config/redis');

const DEFAULT_API_URL = 'https://sn-frieslandcampina.my.salesforce.com/services/data/v56.0/sobjects/Whatsapp__c';
const HTTP_TIMEOUT = { request: 10000, connect: 5000 };

let cachedToken = null;
let cachedExpiryMs = 0;

const httpRequest = (...args) => {
    const got = require('got').default || require('got');
    return got(...args);
};

const isTruthyFlag = (value) => value === true || value === 1 || value === '1' || value === 't' || value === 'true';

const shouldForward = (integration) => isTruthyFlag(integration?.is_forward);

const getSalesforceAppId = () => CONSTANTS.FORWARD.SALESFORCE_APP_ID;

const isSalesforceApp = (appId) => Number(appId) === getSalesforceAppId();

const firstErrorMessage = (errorMsg) => {
    if (!errorMsg) return '';
    if (typeof errorMsg === 'string') return errorMsg;
    if (Array.isArray(errorMsg) && errorMsg.length > 0) {
        return errorMsg[0]?.message || errorMsg[0]?.title || String(errorMsg[0]);
    }
    return errorMsg.message || '';
};

const resolveSalesforceData = (request, errorMessage) => {
    const extras = {
        ...(request?.channel_data && typeof request.channel_data === 'object' ? request.channel_data : {}),
        ...(request?.data && typeof request.data === 'object' ? request.data : {}),
    };

    const errorMsg = extras.error_msg
        || request?.error_msg
        || (errorMessage ? [{ message: errorMessage }] : []);

    return {
        sales_force_id: request?.sales_force_id || extras.sales_force_id,
        brand: request?.brand || extras.brand,
        campaign_code: request?.campaign_code || extras.campaign_code,
        error_msg: errorMsg,
    };
};

const getTokenCacheKey = () => CONSTANTS.FORWARD.SALESFORCE_TOKEN_CACHE_KEY;

const getTokenCacheTtlSeconds = () => {
    const hours = CONSTANTS.FORWARD.SALESFORCE_TOKEN_CACHE_TTL_HOURS;
    const safeHours = Number.isFinite(hours) && hours > 0 ? hours : 12;
    return safeHours * 3600;
};

const parseCachedAccessToken = (raw) => {
    if (!raw) return null;
    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return parsed?.access_token || null;
    } catch {
        return null;
    }
};

const resetSalesforceTokenCache = async () => {
    cachedToken = null;
    cachedExpiryMs = 0;
    await cacheDel(getTokenCacheKey());
};

const readTokenFromRedis = async () => {
    const key = getTokenCacheKey();
    const token = parseCachedAccessToken(await cacheGet(key));
    if (!token) return null;

    cachedToken = token;
    const ttl = await cacheTtl(key);
    const ttlMs = ttl > 0 ? ttl * 1000 : getTokenCacheTtlSeconds() * 1000;
    cachedExpiryMs = Date.now() + Math.max(ttlMs, 1000);
    return token;
};

const writeTokenToCache = async (token) => {
    cachedToken = token;
    const ttlSeconds = getTokenCacheTtlSeconds();
    cachedExpiryMs = Date.now() + (ttlSeconds * 1000);
    await cacheSet(
        getTokenCacheKey(),
        JSON.stringify({ access_token: token }),
        ttlSeconds
    );
};

const getHttpStatus = (error) =>
    error?.response?.statusCode || error?.response?.status || error?.statusCode || null;

const getErrorMessage = (error) => {
    if (!error) return 'Unknown Salesforce error';
    if (error.response?.body) {
        return typeof error.response.body === 'string'
            ? error.response.body
            : JSON.stringify(error.response.body);
    }
    return error.message || String(error);
};

const getSFToken = async (forceRefresh = false) => {
    if (forceRefresh) {
        cachedToken = null;
        cachedExpiryMs = 0;
        await cacheDel(getTokenCacheKey());
    } else if (cachedToken && Date.now() < cachedExpiryMs) {
        return cachedToken;
    } else {
        const cached = await readTokenFromRedis();
        if (cached) return cached;
    }

    const tokenUrl = process.env.SALESFORCE_TOKEN_URL;
    const clientId = process.env.SALESFORCE_CLIENT_ID;
    const clientSecret = process.env.SALESFORCE_CLIENT_SECRET;
    if (!tokenUrl || !clientId || !clientSecret) {
        throw new Error('Salesforce token env is not configured');
    }

    const grantType = process.env.SALESFORCE_GRANT_TYPE || 'password';
    const params = new URLSearchParams({
        grant_type: grantType,
        client_id: clientId,
        client_secret: clientSecret,
    });

    if (grantType === 'password') {
        params.set('username', process.env.SALESFORCE_USERNAME || '');
        params.set('password', process.env.SALESFORCE_PASSWORD || '');
    }

    const response = await httpRequest(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
        timeout: HTTP_TIMEOUT,
        responseType: 'json',
    });

    const token = response.body?.access_token;
    if (!token) {
        throw new Error('Salesforce token response missing access_token');
    }

    await writeTokenToCache(token);
    return token;
};

const postWhatsappRecord = async (token, body) => {
    const apiUrl = process.env.SALESFORCE_API_URL || DEFAULT_API_URL;
    return httpRequest(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        json: body,
        timeout: HTTP_TIMEOUT,
        responseType: 'json',
    });
};

const sendApiSalesForce = async ({ appId, request, phone, resData, sendBy }) => {
    const data = resolveSalesforceData(request, resData?.message);
    if (!data.sales_force_id) return null;

    const apiUrl = process.env.SALESFORCE_API_URL || DEFAULT_API_URL;
    const sfBody = {
        Contact_Id__c: data.sales_force_id,
        Message_Id__c: resData?.msgId || null,
        Message_Status__c: resData?.status || null,
        Send_Time__c: DateTime.now().toISO(),
        Product_Id__c: data.brand || null,
        Campaign_Id__c: data.campaign_code || null,
        Error_Message__c: firstErrorMessage(data.error_msg),
    };

    try {
        let token = await getSFToken();
        try {
            return await postWhatsappRecord(token, sfBody);
        } catch (error) {
            if (getHttpStatus(error) === 401) {
                token = await getSFToken(true);
                return await postWhatsappRecord(token, sfBody);
            }
            throw error;
        }
    } catch (error) {
        await insertApiLog({
            app_id: appId,
            user_id: sendBy || 0,
            request: JSON.stringify(data),
            response: getErrorMessage(error),
            url: apiUrl,
            number: phone,
        });
        return null;
    }
};

const forwardTo = async ({ integration, request, phone, resData }) => {
    if (!shouldForward(integration)) return null;

    const appId = Number(request?.app_id);
    if (!isSalesforceApp(appId)) return null;

    return sendApiSalesForce({
        appId,
        request,
        phone,
        resData,
        sendBy: request?.sent_by,
    });
};

module.exports = {
    shouldForward,
    isSalesforceApp,
    firstErrorMessage,
    resolveSalesforceData,
    resetSalesforceTokenCache,
    parseCachedAccessToken,
    getSFToken,
    sendApiSalesForce,
    forwardTo,
};
