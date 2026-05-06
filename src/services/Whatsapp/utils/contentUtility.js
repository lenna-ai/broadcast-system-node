const { getMediaTypeFromUrl } = require('./mediaUtility');

const setDynamicParams = (optional) => {
    let body = {
        type: 'body',
        parameters: []
    }
    const params = optional['params'] || [];
    if (params.length > 0) {
        let bodyParams = [];
        params.forEach((param) => {
            bodyParams.push({ type: 'text', text: param });
        });

        body.parameters = bodyParams;
    }
    return body;
}
const getContentProvider = (type, optional) => {
    // get body params
    let content = [];
    if (type === '1engage') {
        content = oneEngageContent(optional);
        console.log("content:", JSON.stringify(content));
    } else if (type === 'damcorp') {
        content = damcorpContent(optional);
               console.log("content:", JSON.stringify(content));
    }

    return content;
}

const oneEngageContent = (optional) => {
    const content = [];

    // SET DYNAMIC PARAMS
    const body = setDynamicParams(content, optional);
    content.push(body);
    
    const header = optional['header'];
    // GET HEADER TYPE
    let headerType = header?.headerType || null;
    let headerContent = null;
    if (optional && optional['carousel_cards'] && Array.isArray(optional['carousel_cards'])) {
        headerType = 'carousel';
    }

    // GET HEADER CONTENT
    if (header && headerType && headerType !== 'carousel') {
        if (header && Object.keys(header).length > 0) {
            // IF HEADER TYPE TEXT
            if (headerType === 'text' && header.textHeader) {
                headerContent = {
                    type: 'text',
                    text: header.textHeader
                };
            } 
            // IF HEADER TYPE MEDIA
            else if ([
                'media', 
                'image', 
                'video', 
                'document'].includes(headerType)
                && header.mediaUrl
            ) {
                const mediaType = header.mediaType || getMediaTypeFromUrl(header.mediaUrl) || 'image';
                const mediaPayload = { link: header.mediaUrl };
                if (mediaType === 'document' && header.mediaName) {
                    mediaPayload.filename = header.mediaName;
                }

                headerContent = {
                    type: mediaType,
                    [mediaType]: mediaPayload
                };
            }

            if (headerContent) {
                content.push({
                    type: 'header',
                    parameters: [
                        headerContent
                    ]
                });
            }
        }
    } else if (headerType === 'carousel') {
        let carouselContent = {
            'type': 'carousel',
            'cards': []
        };

        optional['carousel_cards'].forEach((cardData, cardIndex) => {
            const card = {
                card_index: cardIndex,
                components: []
            };

            if (cardData['components'] && cardData['components'].length > 0) {
                card.components = cardData.components;

                // Fix: Meta API error #100 Unexpected key "format"
                card.components.forEach((cardComponent) => {
                    if (cardComponent.hasOwnProperty('format')) {
                        delete cardComponent.format;
                    }
                });
            } else {
                if (cardData['header_params']) {
                    const headerData = cardData['header_params'];
                    const headerType = getMediaTypeFromUrl(headerData['link']) || 'image';
                    const mediaPayload = { link: headerData['link'] };
                    const headerParameter = { type: headerType, [headerType]: mediaPayload };

                    card.components.push({
                        type: 'header',
                        parameters: [headerParameter]
                    });
                }

                if (cardData['body_params']) {
                    const bodyParams = [];
                    cardData['body_params'].forEach((bodyParam) => {
                        if (Array.isArray(bodyParam)) {
                            bodyParams.push(bodyParam);
                        } else {
                            bodyParams.push({ type: 'text', text: String(bodyParam) });
                        }
                    });
                    card.components.push({
                        type: 'body',
                        parameters: bodyParams
                    });
                }

                if (cardData['button_params'] && Array.isArray(cardData['button_params'])) {
                    cardData['button_params'].forEach((buttonParam) => {
                        card.components.push({
                            type: 'button',
                            sub_type: buttonParam['sub_type'], // 'url' or 'quick_reply'
                            index: String(buttonParam['index']),
                            parameters: buttonParam['parameters']
                        });
                    });
                }
            }

            carouselContent.cards.push(card);
        });
        content.push(carouselContent);
    }

    // SET BUTTONS
    const button = optional['button'] || null;
    if (button && button.buttonType === 'call-to-action' && !isEmpty(optional['button_params'])) {
        const callToActionButton = button['callToAction'] || [];
        const buttonParams = optional['button_params'] || [];

        let paramIndex = 0;
        callToActionButton.forEach((item, index) => {
            if (item.urlType === 'dynamic' && buttonParams[paramIndex]) {
                content.push({
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

    // SET BUTTON AUTHENTICATION
    if (optional['category'] && optional['category'].toLowerCase() === 'authentication' && optional['params'] && optional['params'][0]) {
        content.push({
            type: 'button',
            sub_type: 'url',
            index: '0',
            parameters: [
                {
                    type: 'text',
                    text: String(content[0])
                }
            ]
        });
    }



    return content;
}

const damcorpContent = (optional) => {
    const content = [];

    const body = setDynamicParams(optional);
    content.push(body);

    const header = optional['header'] || null;
    console.log("header", header);
    const headerType = header?.headerType || null;
    let headerContent = null;
    if (optional && optional['carousel_cards'] && Array.isArray(optional['carousel_cards'])) {
        headerType = 'carousel';
    }

    if (header && headerType && headerType !== 'carousel') {
        if (header && Object.keys(header).length > 0) {
            if (headerType === 'text' && header.textHeader) {
                headerContent = {
                    type: 'text',
                    data: header.textHeader
                };
            } 

            else if ([
                'media', 
                'image', 
                'video', 
                'document'].includes(headerType)
                && header.mediaUrl
            ) {
                const mediaType = header.mediaType || getMediaTypeFromUrl(header.mediaUrl) || 'image';
                const mediaPayload = { 
                    link: header.mediaUrl 
                };
                if (mediaType === 'document' && header.mediaName) {
                    mediaPayload.filename = header.mediaName;
                }

                headerContent = {
                    type: mediaType,
                    [mediaType]: mediaPayload
                };
            }

            if (headerContent) {
                content.push({
                    type: 'header',
                    parameters: [headerContent]
                });
            }
        }
    }

    const button = optional['button'] || null;
    if (button && button.buttonType === 'call-to-action' && !isEmpty(optional['button_params'])) {
        const callToActionButton = button['callToAction'] || [];
        const buttonParams = optional['button_params'] || [];

        let paramIndex = 0;
        callToActionButton.forEach((item, index) => {
            if (item.urlType === 'dynamic' && buttonParams[paramIndex]) {
                content.push({
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

    // custom authentication component. ONLY SUPPORT OTP CODE
    if (optional['category'] && optional['category'].toLowerCase() === 'authentication' && optional['params'] && optional['params'][0]) {
        content.push({
            type: 'button',
            sub_type: 'url',
            index: '0',
            parameters: [
                {
                    type: 'text',
                    text: String(optional['params'][0])
                }
            ]
        });
    }
    
    return content;

}



module.exports = {
    getContentProvider
}