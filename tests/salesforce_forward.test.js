jest.mock('../src/repositories/log_repository', () => ({
    insertApiLog: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/config/redis', () => ({
    cacheGet: jest.fn().mockResolvedValue(null),
    cacheSet: jest.fn().mockResolvedValue(true),
    cacheDel: jest.fn().mockResolvedValue(true),
    cacheTtl: jest.fn().mockResolvedValue(-1),
    closeRedis: jest.fn().mockResolvedValue(undefined),
}));

const mockGot = jest.fn();
mockGot.default = mockGot;
jest.mock('got', () => mockGot);

const { insertApiLog } = require('../src/repositories/log_repository');
const { cacheGet, cacheSet, cacheDel, cacheTtl } = require('../src/config/redis');
const {
    shouldForward,
    isSalesforceApp,
    firstErrorMessage,
    resolveSalesforceData,
    resetSalesforceTokenCache,
    parseCachedAccessToken,
    forwardTo,
} = require('../src/services/salesforce/salesforce_forward');

describe('salesforce forward', () => {
    const originalEnv = process.env;

    const forwardPayload = {
        integration: { is_forward: true },
        request: {
            app_id: 618,
            sent_by: 9,
            sales_force_id: '003xx',
            channel_data: { brand: 'Frisian', campaign_code: 'CMP' },
        },
        phone: '6281',
        resData: { status: 'sent', msgId: 'wamid.abc' },
    };

    beforeEach(async () => {
        process.env = { ...originalEnv };
        process.env.SALESFORCE_APP_ID = '618';
        process.env.SALESFORCE_TOKEN_URL = 'https://example.my.salesforce.com/services/oauth2/token';
        process.env.SALESFORCE_API_URL = 'https://example.my.salesforce.com/services/data/v56.0/sobjects/Whatsapp__c';
        process.env.SALESFORCE_CLIENT_ID = 'client';
        process.env.SALESFORCE_CLIENT_SECRET = 'secret';
        process.env.SALESFORCE_USERNAME = 'user';
        process.env.SALESFORCE_PASSWORD = 'pass';
        process.env.SALESFORCE_GRANT_TYPE = 'password';
        cacheGet.mockReset().mockResolvedValue(null);
        cacheSet.mockReset().mockResolvedValue(true);
        cacheDel.mockReset().mockResolvedValue(true);
        cacheTtl.mockReset().mockResolvedValue(-1);
        await resetSalesforceTokenCache();
        mockGot.mockReset();
        insertApiLog.mockClear();
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    test('shouldForward reads is_forward from integration column only', () => {
        expect(shouldForward({ is_forward: 1 })).toBe(true);
        expect(shouldForward({ is_forward: true })).toBe(true);
        expect(shouldForward({ is_forward: false, integration_data: { is_forward: true } })).toBe(false);
        expect(shouldForward({ is_forward: 0 })).toBe(false);
        expect(shouldForward({})).toBe(false);
    });

    test('isSalesforceApp matches configured app id', () => {
        expect(isSalesforceApp(618)).toBe(true);
        expect(isSalesforceApp('618')).toBe(true);
        expect(isSalesforceApp(1)).toBe(false);
    });

    test('firstErrorMessage reads damcorp error array', () => {
        expect(firstErrorMessage([{ message: '(#131056) pair rate limit hit' }])).toBe('(#131056) pair rate limit hit');
        expect(firstErrorMessage('failed')).toBe('failed');
        expect(firstErrorMessage(null)).toBe('');
    });

    test('parseCachedAccessToken reads Laravel Cache JSON', () => {
        expect(parseCachedAccessToken(JSON.stringify({ access_token: 'tok' }))).toBe('tok');
        expect(parseCachedAccessToken('not-json')).toBeNull();
        expect(parseCachedAccessToken(null)).toBeNull();
    });

    test('resolveSalesforceData prefers request extras', () => {
        const data = resolveSalesforceData({
            sales_force_id: 'SF-1',
            channel_data: { brand: 'FF', campaign_code: 'C1' },
        }, 'boom');
        expect(data).toEqual({
            sales_force_id: 'SF-1',
            brand: 'FF',
            campaign_code: 'C1',
            error_msg: [{ message: 'boom' }],
        });
    });

    test('skips forward when is_forward is false', async () => {
        await forwardTo({
            integration: { is_forward: 0 },
            request: { app_id: 618, sales_force_id: 'SF-1' },
            phone: '6281',
            resData: { status: 'sent', msgId: 'wamid.1' },
        });
        expect(mockGot).not.toHaveBeenCalled();
    });

    test('app 618 posts Whatsapp__c after fetching token', async () => {
        mockGot
            .mockResolvedValueOnce({ body: { access_token: 'tok', expires_in: 3600 } })
            .mockResolvedValueOnce({ body: { id: 'sf-row' } });

        await forwardTo(forwardPayload);

        expect(mockGot).toHaveBeenCalledTimes(2);
        const sfCall = mockGot.mock.calls[1][1];
        expect(sfCall.json).toMatchObject({
            Contact_Id__c: '003xx',
            Message_Id__c: 'wamid.abc',
            Message_Status__c: 'sent',
            Product_Id__c: 'Frisian',
            Campaign_Id__c: 'CMP',
        });
        expect(sfCall.headers.Authorization).toBe('Bearer tok');
        expect(cacheSet).toHaveBeenCalledWith(
            'ff-access-token',
            JSON.stringify({ access_token: 'tok' }),
            12 * 3600
        );
    });

    test('reuses Redis ff-access-token without calling Salesforce OAuth', async () => {
        cacheGet.mockResolvedValue(JSON.stringify({ access_token: 'cached-tok' }));
        cacheTtl.mockResolvedValue(40000);
        mockGot.mockResolvedValueOnce({ body: { id: 'sf-row' } });

        await forwardTo(forwardPayload);

        expect(mockGot).toHaveBeenCalledTimes(1);
        expect(mockGot.mock.calls[0][1].headers.Authorization).toBe('Bearer cached-tok');
        expect(cacheSet).not.toHaveBeenCalled();
    });

    test('refreshes Redis token after Salesforce 401', async () => {
        mockGot
            .mockResolvedValueOnce({ body: { access_token: 'old-tok' } })
            .mockRejectedValueOnce(Object.assign(new Error('unauthorized'), { response: { statusCode: 401 } }))
            .mockResolvedValueOnce({ body: { access_token: 'new-tok' } })
            .mockResolvedValueOnce({ body: { id: 'sf-row' } });

        await forwardTo(forwardPayload);

        expect(mockGot).toHaveBeenCalledTimes(4);
        expect(mockGot.mock.calls[3][1].headers.Authorization).toBe('Bearer new-tok');
        expect(cacheDel).toHaveBeenCalledWith('ff-access-token');
        expect(cacheSet).toHaveBeenLastCalledWith(
            'ff-access-token',
            JSON.stringify({ access_token: 'new-tok' }),
            12 * 3600
        );
    });

    test('skips forward when message failed', async () => {
        await forwardTo({
            integration: { is_forward: true },
            request: { app_id: 618, sales_force_id: 'SF-1' },
            phone: '6281',
            resData: { status: 'failed', message: '(#131056) pair rate limit hit' },
        });
        expect(mockGot).not.toHaveBeenCalled();
    });

    test('skips salesforce post without sales_force_id', async () => {
        await forwardTo({
            integration: { is_forward: true },
            request: { app_id: 618 },
            phone: '6281',
            resData: { status: 'sent', msgId: 'wamid.abc' },
        });
        expect(mockGot).not.toHaveBeenCalled();
    });

    test('skips other apps even when is_forward is true', async () => {
        await forwardTo({
            integration: { is_forward: 1, forward_url: 'https://hook.example/forward' },
            request: { app_id: 10, sales_force_id: 'SF-1' },
            phone: '6281',
            resData: { status: 'sent', msgId: 'wamid.1' },
        });
        expect(mockGot).not.toHaveBeenCalled();
    });
});
