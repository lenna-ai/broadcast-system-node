//
// OneEngageService.js
//
const db = require('../../config/database');
const { getExternalApi, getExternalApiWithEndpoints } = require('../../repositories/ExternalApi.repositories');
const { getMediaTypeFromUrl } = require('./utils/getMedia');



class OneEngageService {
    constructor() {
        this.api = null;
        this.baseUri = null;
        this.db = db;

    }

    async init() {
        this.api = await getExternalApi({ category: 'channel', provider: '1engage' });
        this.endpoint = await getExternalApiWithEndpoints({ category: 'channel', provider: '1engage' }, {name: 'v15-messages-send'}, this.db);

        let baseUri = this.api?.base_url;

        if (!baseUri) {
            baseUri =
                this.data?.integration?.integration_data?.baseUrl ||
                this.data?.integration?.integration_data?.whatsappBaseUrl ||
                '';
        }

        this.baseUri = baseUri;
    }

    async sendHsm(phone, request, optional) {
        if (!this.endpoint) {
            throw new Error('Endpoint not defined');
        }

        const params = [];
        if (request.params_data && request.params_data.length > 0) {
            // each request.params_data
            let bodyParams = [];
            request.params_data.forEach((item) => {
                bodyParams.push({ type: 'text', text: item });
            });
            console.log('bodyParams', bodyParams);
            params.push({type: 'body', parameters: bodyParams });
        }

        

        // header text
        console.log('optional', optional.header);
        if (optional?.header && Object.keys(optional.header).length > 0) {
            const header = optional.header;
            const headerType = header.headerType || null;

            let headerParameter = null;

            if (headerType === 'text' && header.textHeader) {
                headerParameter = {
                    type: 'text',
                    text: header.textHeader
                };

            } else if (
                ['media', 'image', 'video', 'document'].includes(headerType) &&
                header.mediaUrl
            ) {
                const mediaType =
                    header.mediaType ||
                    getMediaTypeFromUrl(header.mediaUrl) ||
                    'image';
                const mediaPayload = {
                    link: header.mediaUrl
                };
                if (mediaType === 'document' && header.mediaName) {
                    mediaPayload.filename = header.mediaName;
                }
                headerParameter = {
                    type: mediaType,
                    [mediaType]: mediaPayload
                };
            }

            if (headerParameter) {
                params.push({
                    type: 'header',
                    parameters: [headerParameter]
                });
            }
        }

        const button = request.template?.button || null;
        if (button && button.buttonType === 'call-to-action' && !isEmpty(optional['button_params'])) {
            const callToActionButton = button['callToAction'] || [];
            const buttonParams = optional['button_params'] || [];

            let paramIndex = 0;
            callToActionButton.forEach((item, index) => {
                if (item.urlType === 'dynamic' && buttonParams[paramIndex]) {
                    params.push({
                        type: 'button',
                        sub_type: 'url',
                        index: index.toString(),
                        parameters: [{
                            type: 'text',
                            text: buttonParams[paramIndex]
                        }]
                    });
                    paramIndex++;
                }
            });
        }
        
        if (
            optional?.category &&
            optional.category.toLowerCase() === 'authentication' &&
            params?.[0] !== undefined
        ) {
            params.push({
                type: 'button',
                sub_type: 'url',
                index: '0',
                parameters: [
                    {
                        type: 'text',
                        text: String(params[0])
                    }
                ]
            });
        }
    }
}

module.exports = OneEngageService;
