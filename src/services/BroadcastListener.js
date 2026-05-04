const db = require('../config/database');
const { normalizeRecipients } = require('./Whatsapp/utils/phoneNormalizer');
const OneEngageService = require('./Whatsapp/OneEngage.service');
class BroadcastListener {
    
    /**
     * @param {Object} request
     * @param {Array} data
     */
    static async listen(request, data) {
        // construct processData
        return await db.transaction(async (trx) => {
            try {
                let provider = '1engage';
                
                const { 
                    integration, 
                    template 
                } = await this.validateRequest(request, trx);
                const phone = normalizeRecipients(request.recipient);
                
                let header = null;
                let footer = null;
                let button = null;

                const integrationData = typeof integration.integration_data === 'string' 
                    ? JSON.parse(integration.integration_data) 
                    : (integration.integration_data || {});

                provider = integrationData.apiService || provider;

                if (provider === '1engage') {
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
                        description: request?.description,
                        broadcast_name: request?.broadcast_name,
                        broadcast_id: request?.broadcast_id,
                        category: request?.template?.category,
                    };


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
                        const service = new OneEngageService();
                        await service.init();
                        await service.sendHsm(phone, request, optional);
                    } catch (error) {
                        console.error(`[Broadcast Listener] 1Engage failed:`, error.message);
                        throw error;
                    }

                    return "tes";

                } else if (provider === 'damcorp') {
                    // Proses damcorp
                    return { status: 'damcorp_processed' };
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

        return { integration, template };
    }
}

module.exports = BroadcastListener;