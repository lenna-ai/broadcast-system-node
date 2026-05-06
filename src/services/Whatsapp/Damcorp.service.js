const db = require('../../config/database');
const { getExternalApi, getExternalApiWithEndpoints } = require('../../repositories/ExternalApi.repositories');
const { sendBroadcast, saveBroadcastMessage } = require('../../repositories/Broadcast.repositories');
const { getContentProvider } = require('./utils/contentUtility');
const { insertApiLog } = require('../../repositories/Log.repositories');

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

    async init() {
        this.api = await getExternalApi({category: 'channel', provider: 'damcorp-v2-waba'});
        this.sendMessageApiUrl = await getExternalApiWithEndpoints({category: 'channel', provider: 'damcorp-v2-waba'}, {name: 'send-message'}, this.db);
        this.getTokenApiUrl = await getExternalApiWithEndpoints({category: 'channel', provider: 'damcorp-v2-waba'}, {name: 'get-token'}, this.db);
        this.baseUri = this.api?.base_url || '';
        // Implement initialization logic here
    }

    async handle(phone, request, optional) {
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
            // to: phone,
            template: {
                name: request.template?.template_name,
                language: {
                    code: request.template?.language ?? 'id',
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
            });
        }

        let status = null;
        let messageId = null;
        let waId = null;

        // SET DEFAULT DATA
        if (response && response?.messages?.[0]?.id) {
            status = 'sent';
            messageId = response['messages'][0]['id'];
            waId = response['contacts'][0]['wa_id'];
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
            'timestamp': DateTime.now().toFormat('yyyy-MM-dd HH:mm:ss')
        }


        await saveBroadcastMessage(request, this.integration, resData, payload);
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
        let updIntegration = integration;

        if (
            integration.integration_data?.tokenAPIExpired &&
            integration.integration_data?.tokenAPI
        ) {
            const now = DateTime.now().setZone('Asia/Jakarta');
            const expired = DateTime.fromISO(integration.integration_data.tokenAPIExpired).setZone('Asia/Jakarta');
            const diffHours = now.diff(expired, 'hours').hours;

            if (diffHours <= 24) {
                updIntegration = await this.getTokenAPI(integration);
            } else {
                updIntegration = integration;
            }
        } else {
            updIntegration = await this.getTokenAPI(integration);
        }

        return updIntegration;
    }

    async getTokenAPI(integration) {
        // Implement get token API logic here
        let data = integration.integration_data || {};
        const auth = Buffer.from(`${data.clientId}:${data.secretKey}`).toString('base64');
        const response = await fetch(this.baseUri + this.getTokenApiUrl?.endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`
            }
        });
        const responseData = await response.json();
        integration = await this.saveToken(integration, responseData);

        return integration;
    }

    async saveToken(integration, response) {
        let data = integration.integration_data || {};
        data.tokenApi = response.users[0].token;
        data.tokenAPIExpired = response.users[0].expires_after;
        integration.integration_data = data;

        await this.db('omnichannel.integrations')
            .where({ id: integration.id })
            .update({
                integration_data: JSON.stringify(data)
        });

        this.integration = integration;
        return integration;
    }
}

module.exports = DamcorpService;