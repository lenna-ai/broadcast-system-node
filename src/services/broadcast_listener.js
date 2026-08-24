const db = require('../config/database');
const CONSTANTS = require('../config/constants');
const { normalizeRecipients } = require('./whatsapp/utils/phone_utility');
const OneEngageService = require('./whatsapp/one_engage_service');
const DamcorpService = require('./whatsapp/damcorp_service');
const { saveBroadcastMessage } = require('../repositories/broadcast_repository');
const { withParsedIntegrationData } = require('../helpers/integration_data');
const { resolveCarouselCards } = require('./whatsapp/utils/content_utility');

class BroadcastListener {

    /**
     * Load DB-backed context in a short transaction, then send via provider HTTP
     * without holding a pooled connection for the API round-trip.
     */
    static async listen(request) {
        const { service, phone, optional, provider } = await this.prepareSend(request);

        try {
            if (provider === '1engage') {
                return await service.sendHsm(phone, request, optional);
            }
            if (provider === 'damcorp') {
                return await service.handle(phone, request, optional);
            }
            if (provider === 'wappin') {
                return { status: 'wappin_processed' };
            }
            throw new Error('Provider not found');
        } catch (error) {
            console.error(`[Broadcast Listener] ${provider} failed:`, error.message);
            throw error;
        }
    }

    static async prepareSend(request) {
        return db.transaction(async (trx) => {
            const { integration } = await this.validateRequest(request, trx);
            const phone = normalizeRecipients(request.recipient);
            const integrationData = withParsedIntegrationData(integration).integration_data;
            const optional = this.buildOptional(request);
            const provider = integrationData.apiService || '1engage';

            let service = null;
            if (provider === '1engage') {
                service = new OneEngageService(withParsedIntegrationData(integration));
                await service.init(trx);
            } else if (provider === 'damcorp') {
                service = new DamcorpService(withParsedIntegrationData(integration));
                await service.init(trx);
            }

            return { service, phone, optional, provider };
        });
    }

    static buildOptional(request) {
        let header = null;
        let footer = null;
        let button = null;

        if (request.template?.header) {
            const headerData = typeof request.template.header === 'string'
                ? JSON.parse(request.template.header)
                : request.template.header;
            let textHeaderToSend = headerData.textHeader || null;
            const hsmTemplate = request.broadcast?.hsmTemplate;

            if (hsmTemplate?.header?.headerType === 'text') {
                const templateText = hsmTemplate.header.textHeader || '';
                if (!templateText.includes('{{')) {
                    textHeaderToSend = null;
                }
            }
            header = {
                headerType: headerData.headerType || null,
                mediaUrl: headerData.mediaUrl || null,
                mediaName: headerData.mediaName || null,
                textHeader: textHeaderToSend,
            };
        }

        footer = request.template.footer
            ? (typeof request.template.footer === 'string' ? JSON.parse(request.template.footer) : request.template.footer)
            : null;
        button = request.template.button
            ? (typeof request.template.button === 'string' ? JSON.parse(request.template.button) : request.template.button)
            : null;

        const paramsData = request?.params_data;
        const normalizedParams = Array.isArray(paramsData)
            ? paramsData
            : (paramsData?.body || []);

        const optional = {
            header,
            footer,
            button,
            broadcast_id: request?.broadcast_id,
            category: request?.template?.category,
            params: normalizedParams,
        };
        if (request.template?.type === 'carousel') {
            optional.carousel_cards = resolveCarouselCards(request, paramsData);
        }
        return optional;
    }

    static async failed(request) {
        let broadcastPayload = request?.data ?? request;
        if (typeof broadcastPayload === 'string') {
            broadcastPayload = JSON.parse(broadcastPayload);
        }
        const errorReason = request?.error_reason || 'Processing failed';
        const failedAt = request?.failed_at || new Date().toISOString();

        if (!broadcastPayload || typeof broadcastPayload !== 'object') {
            throw new Error('Invalid failed message payload');
        }
        if (typeof broadcastPayload.template === 'string') {
            broadcastPayload.template = JSON.parse(broadcastPayload.template);
        }

        const resData = {
            'to': broadcastPayload.recipient,
            'status': 'failed',
            'msgId': null,
            'trxId': null,
            'message': errorReason,
            'timestamp': failedAt,
        };

        await saveBroadcastMessage(
            broadcastPayload,
            resData,
            []
        );

        console.log("Failed message executed:", resData);
    }

    static async validateRequest(request, trx) {
        const integration = await trx('omnichannel.integrations')
            .where('channel_id', CONSTANTS.CHANNEL.WHATSAPP.ID)
            .where('id', request.integration_id)
            .first();

        if (!integration) {
            throw new Error('Integration not found');
        }

        const template = await trx('omnichannel.hsm_templates')
            .where('id', request.template?.id)
            .first();

        if (!template) {
            throw new Error('Template not found');
        }

        const broadcast = await trx('omnichannel.broadcasts')
            .where('id', request.broadcast_id)
            .first();

        if (!broadcast) {
            throw new Error('Broadcast not found');
        }
        return { integration, template, broadcast };
    }
}

module.exports = BroadcastListener;
