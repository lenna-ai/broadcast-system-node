//
// OneEngageService.js
//
const db = require('../../config/database');
const { getExternalApi, getExternalApiWithEndpoints } = require('../../repositories/ExternalApi.repositories');
const { sendBroadcast, saveBroadcastMessage } = require('../../repositories/Broadcast.repositories');
const { getContentProvider } = require('./utils/contentUtility');
const DateTime = require('luxon').DateTime;


class OneEngageService {
    constructor(integration) {
        this.api = null;
        this.baseUri = null;
        this.db = db;
        this.integration = integration;
        this.broadcast = null;
    }

    async init() {
        this.api = await getExternalApi({ category: 'channel', provider: '1engage' });
        this.endpoint = await getExternalApiWithEndpoints({ category: 'channel', provider: '1engage' }, {name: 'v15-messages-send'}, this.db);

        let baseUri = this.api?.base_url;
        if (!baseUri) {
            baseUri = this.integration?.integration_data?.baseUrl || '';
        }
        this.baseUri = baseUri;
    }

    async sendHsm(phone, request, optional) {
        if (!this.endpoint) {
            throw new Error('Api is not defined');
        }

        const params = getContentProvider('1engage', optional);
        const baseRequestData = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            type: 'template',
            template: {
                name: request.template.template_name,
                language: { code: request.template.language || 'id' },
                components: params
            }
        };

        const baseUri = this.baseUri;
        const requestEndpoint = baseUri + (this.endpoint?.endpoint || '').replace(
            '{phone_number_id}',
            this.integration?.integration_data?.clientId || ''
        );

        const authHeader = this.getAuthHeader(this.integration?.integration_data || []);
        const payload = {...baseRequestData, to: phone};

        // =====================================================================
        // Send Request
        // =====================================================================
        let response = null;
        try {
            response = await sendBroadcast(this.endpoint?.method, requestEndpoint, {
                headers: authHeader,
                json: payload,
                responseType: 'json'
            });
        } catch (error) {
            // API LOG
            const err = error.response?.body || error.message;
            console.error("Failed to send broadcast:", err);
            await insertApiLog({
                app_id: request.app_id,
                request: JSON.stringify(payload),
                response: JSON.stringify(err),
                number: phone,
                url: requestEndpoint,
            });

            throw error;
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

        // save broadcast message
        await saveBroadcastMessage(request, resData, payload);
        // add api log
        
        return resData;
    }

    // =====================================================================
    // Get Auth Header
    // =====================================================================
    getAuthHeader(integration_data = []) {
        const token = integration_data.token ?? null;
        const headers = {};
        if (token) {
            headers['Authorization'] = 'Bearer ' + token;
        }
        return headers;
    }
}

module.exports = OneEngageService;
