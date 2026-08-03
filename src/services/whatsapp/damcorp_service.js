const db = require('../../config/database');
const { getExternalApi, getExternalApiWithEndpoints } = require('../../repositories/external_api_repository');
const { sendBroadcast, saveBroadcastMessage } = require('../../repositories/broadcast_repository');
const { getContentProvider } = require('./utils/content_utility');
const { insertApiLog } = require('../../repositories/log_repository');

const DateTime = require('luxon').DateTime;


class DamcorpService {
    constructor(integration) {
        this.integration = integration;
        this.api = null;
        this.endpoint = null;
        this.sendMessageApiUrl = null;
        this.getTokenApiUrl = null;
        this.db = db;
    }

    async init(trx = this.db) {
        this.api = await getExternalApi({ category: 'channel', provider: 'damcorp-v2-waba' }, trx);
        this.sendMessageApiUrl = await getExternalApiWithEndpoints({ category: 'channel', provider: 'damcorp-v2-waba' }, { name: 'send-message' }, trx);
        this.getTokenApiUrl = await getExternalApiWithEndpoints({ category: 'channel', provider: 'damcorp-v2-waba' }, { name: 'get-token' }, trx);
        this.baseUri = this.api?.base_url || '';
        // Implement initialization logic here
    }

    async handle(phone, request, optional, trx = this.db) {
        this.trx = trx;
        // CHECK API TOKEN
        try {
            this.integration = await this.apiToken(this.integration);
        } catch (error) {
            console.error("Failed to get API token:", error);
            throw error;
        }
        const params = getContentProvider('damcorp', optional);
        const payload = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            type: 'template',
            to: phone,
            template: {
                name: request.template?.template_name,
                language: {
                    code: request.template?.language ?? request.template?.languange ?? 'id',
                },
                components: params
            }
        };
        if (optional?.category && optional.category.toLowerCase() === 'marketing' && this.integration?.integration_data?.accountMMLite === true) {
            payload.dkd_marketing_type = "marketing_lite";
        }

        const authHeader = this.getAuthHeader(this.integration?.integration_data || {});
        const url = this.baseUri + this.sendMessageApiUrl?.endpoint;
        let response = null;
        console.log('payload', JSON.stringify(payload));
        try {
            // SEND BROADCAST EVENT
            response = await sendBroadcast(this.sendMessageApiUrl?.method, url, {
                headers: authHeader,
                json: payload,
                responseType: 'json'
            });

        } catch (error) {
            const err = error.response?.body || error.message;  
            console.error("Failed to send broadcast:", err);

            await insertApiLog({
                app_id: request.app_id,
                request: JSON.stringify(payload),
                response: JSON.stringify(err),
                number: phone,
                url: url,
            }, trx);

            throw error;
        }

        let status = null;
        let messageId = null;
        let message = 'null';
        let waId = null;

        // SET DEFAULT DATA
        if (response && response?.messages?.[0]?.id) {
            status = 'sent';
            messageId = response['messages'][0]['id'];
            waId = response['contacts'][0]['wa_id'];
            // handle error message
            if (response?.error_msg?.length > 0) {
                message = response?.error_msg?.[0]?.message || '';
                status = 'failed';
            }
        } else {
            status = 'failed';
            messageId = null;
            waId = null;
        }

        const resData = {
            'to': phone,
            'msgId': messageId,
            'status': status,
            'trxId': waId,
            'timestamp': DateTime.now().toFormat('yyyy-MM-dd HH:mm:ss'),
            'message': message
        }

        await saveBroadcastMessage(request, resData, payload, trx);
        return resData;
    }

    getAuthHeader(integration_data = []) {
        const token = integration_data.tokenApi ?? null;
        const headers = {};
        if (token) {
            headers['Authorization'] = 'Bearer ' + token;
            headers['Content-Type'] = 'application/json';
        }
        return headers;
    }

    async apiToken(integration) {
        const tokenData = integration.integration_data || {};

        if (tokenData.tokenApi && tokenData.tokenAPIExpired) {
            const now = DateTime.now().setZone('Asia/Jakarta');
            const expiresAt = DateTime.fromISO(tokenData.tokenAPIExpired).setZone('Asia/Jakarta');
            const hoursUntilExpiry = expiresAt.diff(now, 'hours').hours;

            if (hoursUntilExpiry > 24) {
                return integration;
            }
        }

        return this.getTokenAPI(integration);
    }

    async getTokenAPI(integration) {
        const data = integration.integration_data || {};
        if (!data.clientId || !data.secretKey) {
            throw new Error(
                `Damcorp credentials missing for integration=${integration.id} (clientId/secretKey)`
            );
        }

        const auth = Buffer.from(`${data.clientId}:${data.secretKey}`).toString('base64');
        const url = `${this.baseUri}${this.getTokenApiUrl?.endpoint || ''}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Basic ${auth}`,
            },
        });

        const rawBody = await response.text();

        let responseData;
        try {
            responseData = JSON.parse(rawBody);
        } catch {
            throw new Error(
                `Damcorp get-token returned non-JSON (HTTP ${response.status}) ${url}: ${rawBody.slice(0, 200)}`
            );
        }

        if (!response.ok) {
            throw new Error(
                `Damcorp get-token failed (HTTP ${response.status}) ${url}: ${rawBody.slice(0, 200)}`
            );
        }

        return this.saveToken(integration, responseData);
    }

    async saveToken(integration, response) {
        let data = integration.integration_data || {};
        data.tokenApi = response.users[0].token;
        data.tokenAPIExpired = response.users[0].expires_after;
        integration.integration_data = data;

        const query = this.trx || this.db;
        await query('omnichannel.integrations')
            .where({ id: integration.id })
            .update({
                integration_data: JSON.stringify(data)
        });

        this.integration = integration;
        return integration;
    }
}

module.exports = DamcorpService;