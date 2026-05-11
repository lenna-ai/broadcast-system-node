const db = require('../config/database');
const { normalizeRecipients } = require('./whatsapp/utils/phoneUtility');
const OneEngageService = require('./whatsapp/OneEngage.service');
const DamcorpService = require('./whatsapp/Damcorp.service');
const { saveBroadcastMessage } = require('../repositories/Broadcast.repositories');
//HELPERS RESPONSE


class BroadcastListener {
    
    /**
     * @param {Object} request
     * @param {Array} data
     */
    static async listen(request) {
        // construct processData
        return await db.transaction(async (trx) => {
            try {
                let provider = '1engage';
                
                const { 
                    integration, 
                    template,
                    broadcast 
                } = await this.validateRequest(request, trx);
                const phone = normalizeRecipients(request.recipient);
                
                let header = null;
                let footer = null;
                let button = null;

                const integrationData = typeof integration.integration_data === 'string' 
                    ? JSON.parse(integration.integration_data) 
                    : (integration.integration_data || {});

                if (request.template?.header) {
                    const headerData = typeof request.template.header === 'string' ? JSON.parse(request.template.header) : request.template.header;
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

                footer = request.template.footer ? (typeof request.template.footer === 'string' ? JSON.parse(request.template.footer) : request.template.footer) : null;
                button = request.template.button ? (typeof request.template.button === 'string' ? JSON.parse(request.template.button) : request.template.button) : null;

                const optional = {
                    header: header,
                    footer: footer,
                    button: button,
                    broadcast_id: request?.broadcast_id,
                    category: request?.template?.category,
                    params: request?.params_data || [],
                };

                provider = integrationData.apiService || provider;
                let response = null;
                if (provider === '1engage') {
                    // Parsing components untuk Whatsapp Carousel
                    if (request.components) {
                        const componentsData = typeof request.components === 'string' ? JSON.parse(request.components) : request.components;
                        
                        if (Array.isArray(componentsData)) {
                            for (const comp of componentsData) {
                                if (comp.type && comp.type.toLowerCase() === 'carousel' && comp.cards) {
                                    optional.carousel_cards = comp.cards;
                                }
                            }
                        }
                    }

                    try {
                        const service = new OneEngageService(integration);
                        await service.init();
                        response = await service.sendHsm(phone, request, optional);

                        return response;
                    } catch (error) {
                        console.error(`[Broadcast Listener] 1Engage failed:`, error.message);
                        throw error;
                    }

                } else if (provider === 'damcorp') {
                    // Proses damcorp
                    try {
                        const service = new DamcorpService(integration);
                        await service.init();
                        response = await service.handle(phone, request, optional);

                        return response;
                    } catch (error) {
                        console.error(`[Broadcast Listener] Damcorp failed:`, error.message);
                        throw error;
                    }
                } else if (provider === 'wappin') {
                    // Proses wappin
                    return { status: 'wappin_processed' };
                } else {
                    throw new Error('Provider not found');
                }

            } catch (error) {
                console.error(`[Broadcast Listener] Transaction Failed:`, error.message);
                // Throw error agar transaksi DB di-rollback otomatis oleh Knex
                throw error; 
            }
        }); 
        // End of transaction
    }

    static async failed(request) {

        const data = request.data || [];
        const errorReason = request.error_reason || null;
        const failedAt = request.failed_at || new Date().toISOString();
        let resData = {
            'to': data.recipient,
            'status': 'failed',
            'msgId': null,
            'trxId': null,
            'message': errorReason,
            'timestamp': failedAt,
        }

        await saveBroadcastMessage(
            data,
            resData,
            []
        );

        console.log("Failed message executed:", resData);
    }

    static async validateRequest(request, trx) {
        const integration = await trx('omnichannel.integrations')
            .where('channel_id', 4)
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
        return { integration, template, broadcast};
    }
}

module.exports = BroadcastListener;