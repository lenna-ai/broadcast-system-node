const { getMediaTypeFromUrl } = require('./media_utility');

const normalizeTextParameter = (value) => ({
    type: 'text',
    text: String(value),
});

const normalizeButtonParameter = (param) => {
    if (!param || typeof param !== 'object') {
        return normalizeTextParameter(param);
    }

    if (param.type === 'quick_reply') {
        return {
            type: 'payload',
            payload: String(param.payload || param.text || ''),
        };
    }

    if (param.type) {
        return param;
    }

    return normalizeTextParameter(param);
};

const buildCarouselHeaderComponent = (link) => {
    if (!link) return null;

    const mediaType = getMediaTypeFromUrl(link) || 'image';
    return {
        type: 'header',
        parameters: [{
            type: mediaType,
            [mediaType]: { link },
        }],
    };
};

const normalizeBodyParameter = (param) => {
    if (param && typeof param === 'object' && param.type === 'text') {
        return { type: 'text', text: String(param.text) };
    }
    return normalizeTextParameter(param);
};

const isMetaTextParameters = (parameters) =>
    Array.isArray(parameters)
    && parameters.length > 0
    && parameters.every((param) => param?.type === 'text' && param.text != null);

const parseJsonIfString = (value) => {
    if (typeof value !== 'string') return value;
    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
};

const extractCarouselCardsFromComponents = (components) => {
    const parsed = parseJsonIfString(components);
    if (!Array.isArray(parsed)) return null;

    for (const component of parsed) {
        const type = (component?.type || '').toLowerCase();
        if (type === 'carousel' && Array.isArray(component.cards) && component.cards.length) {
            return component.cards;
        }
    }

    return null;
};

const resolveCarouselCards = (request, paramsData = null) => {
    const cardParamsList = Array.isArray(paramsData?.cards) ? paramsData.cards : null;

    const enrichCard = (card, index) => ({
        ...card,
        body_params: card.body_params
            || card.params
            || card.params_data
            || (cardParamsList?.[index] ?? []),
    });

    const fromComponents = extractCarouselCardsFromComponents(request?.components)
        || extractCarouselCardsFromComponents(request?.template?.components);

    if (fromComponents?.length) {
        return fromComponents.map((card, index) => enrichCard(card, index));
    }

    if (Array.isArray(request?.carousel_cards) && request.carousel_cards.length) {
        return request.carousel_cards.map((card, index) => enrichCard(card, index));
    }

    return (request?.template?.cards || []).map((card, index) => enrichCard(card, index));
};

const PLACEHOLDER_REGEX = /\{\{\d+\}\}/g;

const hasPlaceholders = (text) => typeof text === 'string' && PLACEHOLDER_REGEX.test(text);

const resolveBodyParams = (component, cardData = {}) => {
    if (Array.isArray(component?.body_params) && component.body_params.length) {
        return component.body_params;
    }
    if (Array.isArray(component?.parameters) && component.parameters.length) {
        return component.parameters;
    }
    if (Array.isArray(component?.params) && component.params.length) {
        return component.params;
    }
    if (Array.isArray(cardData?.body_params) && cardData.body_params.length) {
        return cardData.body_params;
    }
    if (Array.isArray(cardData?.params) && cardData.params.length) {
        return cardData.params;
    }
    return [];
};

const buildBodyParametersFromText = (text, bodyParams = []) => {
    if (!hasPlaceholders(text)) {
        return [];
    }

    return bodyParams.map((param) => {
        if (param && typeof param === 'object' && param.type) {
            return param;
        }
        return normalizeTextParameter(param);
    });
};

const buildCarouselBodyComponent = (bodyParams, bodyText = null) => {
    if (bodyText != null) {
        const parameters = buildBodyParametersFromText(bodyText, bodyParams);
        if (!hasPlaceholders(bodyText)) {
            return { type: 'body', parameters: [] };
        }
        return { type: 'body', parameters };
    }

    if (!bodyParams?.length) return null;

    const parameters = bodyParams.map((param) => {
        if (param && typeof param === 'object' && param.type) {
            return param;
        }
        return normalizeTextParameter(param);
    });

    return { type: 'body', parameters };
};

const buildCarouselButtonComponent = (buttonParam) => ({
    type: 'button',
    sub_type: buttonParam.sub_type || 'url',
    index: Number(buttonParam.index ?? 0),
    parameters: (buttonParam.parameters || []).map(normalizeButtonParameter),
});

const normalizeMetaCarouselComponent = (component) => {
    const sanitized = { ...component };
    delete sanitized.format;

    if (sanitized.type === 'button' && sanitized.index !== undefined) {
        sanitized.index = Number(sanitized.index);
    }

    if (Array.isArray(sanitized.parameters)) {
        sanitized.parameters = sanitized.parameters.map(normalizeButtonParameter);
    }

    return sanitized;
};

const convertTemplateButtonToMeta = (button, index) => {
    const buttonType = (button.type || '').toLowerCase();

    if (buttonType === 'quick_reply') {
        return {
            type: 'button',
            sub_type: 'quick_reply',
            index,
            parameters: [{
                type: 'payload',
                payload: String(button.payload || button.text || ''),
            }],
        };
    }

    if (buttonType === 'phone_number') {
        return {
            type: 'button',
            sub_type: 'phone_number',
            index,
            parameters: [],
        };
    }

    return {
        type: 'button',
        sub_type: 'url',
        index,
        parameters: [{
            type: 'text',
            text: String(button.text || button.url || ''),
        }],
    };
};

const convertCardComponentsToMeta = (components, cardData = {}) => {
    const result = [];
    let buttonIndex = 0;

    components.forEach((component) => {
        const normalizedType = (component.type || '').toLowerCase();

        if (['header', 'body', 'button'].includes(normalizedType) && component.parameters) {
            if (normalizedType === 'body') {
                const bodyText = component.text ?? component.body ?? null;

                if (isMetaTextParameters(component.parameters) && (bodyText == null || !hasPlaceholders(bodyText))) {
                    result.push({
                        type: 'body',
                        parameters: component.parameters.map(normalizeBodyParameter),
                    });
                    return;
                }

                const bodyParams = resolveBodyParams(component, cardData);
                const parameters = bodyText != null
                    ? buildBodyParametersFromText(bodyText, bodyParams.length ? bodyParams : component.parameters)
                    : component.parameters.map(normalizeBodyParameter);

                result.push({ type: 'body', parameters });
            } else {
                result.push(normalizeMetaCarouselComponent({ ...component, type: normalizedType }));
            }

            if (normalizedType === 'button') {
                buttonIndex += 1;
            }
            return;
        }

        const type = (component.type || '').toUpperCase();

        if (type === 'HEADER') {
            const header = buildCarouselHeaderComponent(component.mediaUrl || component.link);
            if (header) result.push(header);
            return;
        }

        if (type === 'BODY') {
            if (component.text !== undefined && component.text !== null) {
                const bodyParams = resolveBodyParams(component, cardData);
                result.push({
                    type: 'body',
                    parameters: buildBodyParametersFromText(component.text, bodyParams),
                });
            }
            return;
        }

        if ((type === 'BUTTONS' || normalizedType === 'buttons') && Array.isArray(component.buttons)) {
            component.buttons.forEach((button) => {
                result.push(convertTemplateButtonToMeta(button, buttonIndex));
                buttonIndex += 1;
            });
            return;
        }

        if (normalizedType === 'header' && (component.mediaUrl || component.link)) {
            const header = buildCarouselHeaderComponent(component.mediaUrl || component.link);
            if (header) result.push(header);
        }
    });

    return result;
};

const buildCarouselCard = (cardData, cardIndex) => {
    let components = [];

    if (cardData.components?.length > 0) {
        components = convertCardComponentsToMeta(cardData.components, cardData);
    } else {
        const header = buildCarouselHeaderComponent(cardData.header_params?.link || cardData.header_params?.mediaUrl);
        if (header) components.push(header);

        const body = buildCarouselBodyComponent(
            cardData.body_params,
            cardData.body ?? cardData.body_text ?? null
        );
        if (body) components.push(body);

        if (Array.isArray(cardData.button_params)) {
            cardData.button_params.forEach((buttonParam, index) => {
                components.push(buildCarouselButtonComponent({ ...buttonParam, index: buttonParam.index ?? index }));
            });
        }
    }

    return {
        card_index: cardData.card_index ?? cardIndex,
        components,
    };
};

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
    } else if (type === 'damcorp') {
        content = damcorpContent(optional);
    }

    return content;
}

const oneEngageContent = (optional) => {
    const content = [];

    // SET DYNAMIC PARAMS
    const body = setDynamicParams(optional);
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
            carouselContent.cards.push(buildCarouselCard(cardData, cardIndex));
        });
        content.push(carouselContent);
    }

    // SET BUTTONS
    const button = optional['button'] || null;
    if (button && button.buttonType === 'call-to-action' && optional['button_params'] && optional['button_params'].length) {
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
    let headerType = header?.headerType || null;
    let headerContent = null;

    if (optional?.carousel_cards?.length) {
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
    } else if (headerType === 'carousel') {
        const carouselContent = {
            type: 'carousel',
            cards: [],
        };

        optional.carousel_cards.forEach((cardData, cardIndex) => {
            carouselContent.cards.push(buildCarouselCard(cardData, cardIndex));
        });
        content.push(carouselContent);
    }

    const button = optional['button'] || null;
    if (button && button.buttonType === 'call-to-action' && optional['button_params'] && optional['button_params'].length) {
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
    getContentProvider,
    extractCarouselCardsFromComponents,
    resolveCarouselCards,
};