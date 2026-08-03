const { getContentProvider } = require('../src/services/whatsapp/utils/content_utility');

const carouselPayload = {
    header: [],
    footer: [],
    button: [],
    category: 'MARKETING',
    params: [],
    carousel_cards: [
        {
            components: [
                {
                    type: 'HEADER',
                    format: 'IMAGE',
                    mediaUrl: 'https://lenna-prod.s3.ap-southeast-1.amazonaws.com/upload/513/whatsapp/1784801221_yf29G_6304ea816823cf0a4b06f777_what-is-testing.jpg',
                },
                { type: 'BODY', text: 'template_carousel_damcorp' },
                {
                    type: 'BUTTONS',
                    buttons: [{ type: 'QUICK_REPLY', text: 'Preview' }],
                },
            ],
        },
        {
            components: [
                {
                    type: 'HEADER',
                    format: 'IMAGE',
                    mediaUrl: 'https://lenna-prod.s3.ap-southeast-1.amazonaws.com/upload/513/whatsapp/1784801221_kJuEz_6304ea816823cf0a4b06f777_what-is-testing.jpg',
                },
                { type: 'BODY', text: 'Card 2' },
                {
                    type: 'BUTTONS',
                    buttons: [{ type: 'QUICK_REPLY', text: 'See it' }],
                },
            ],
        },
    ],
};

const dynamicCarouselPayload = {
    params: ['Rans', '10', '12 Desember 2026', 'Gas'],
    carousel_cards: [
        {
            body_params: ['10', 'Rans'],
            components: [
                {
                    type: 'HEADER',
                    format: 'IMAGE',
                    mediaUrl: 'https://example.com/card-1.jpg',
                },
                {
                    type: 'BODY',
                    text: '✨ Produk Favorit Minggu Ini! Diskon hingga {{1}}% khusus untuk {{2}}',
                },
                {
                    type: 'BUTTONS',
                    buttons: [{ type: 'QUICK_REPLY', text: 'reply 1' }],
                },
            ],
        },
        {
            body_params: ['20', 'Budi'],
            components: [
                {
                    type: 'HEADER',
                    format: 'IMAGE',
                    mediaUrl: 'https://example.com/card-2.jpg',
                },
                {
                    type: 'BODY',
                    text: '✨ Produk Favorit Minggu Ini! Diskon hingga {{1}}% khusus untuk {{2}}',
                },
                {
                    type: 'BUTTONS',
                    buttons: [{ type: 'QUICK_REPLY', text: 'reply 2' }],
                },
            ],
        },
    ],
};

describe('content_utility carousel', () => {
    it('builds damcorp carousel without throwing', () => {
        expect(() => getContentProvider('damcorp', carouselPayload)).not.toThrow();
    });

    it('includes carousel component for damcorp', () => {
        const components = getContentProvider('damcorp', carouselPayload);
        const carousel = components.find((c) => c.type === 'carousel');

        expect(carousel).toBeDefined();
        expect(carousel.cards).toHaveLength(2);
        expect(carousel.cards[0].components.some((c) => c.type === 'header')).toBe(true);
        expect(carousel.cards[0].components.some((c) => c.sub_type === 'quick_reply')).toBe(true);
    });

    it('builds 1engage carousel without throwing', () => {
        expect(() => getContentProvider('1engage', carouselPayload)).not.toThrow();
    });

    it('maps carousel card body placeholders to body_params for damcorp', () => {
        const components = getContentProvider('damcorp', dynamicCarouselPayload);
        const carousel = components.find((c) => c.type === 'carousel');
        const cardBody = carousel.cards[0].components.find((c) => c.type === 'body');

        expect(cardBody.parameters).toEqual([
            { type: 'text', text: '10' },
            { type: 'text', text: 'Rans' },
        ]);
        expect(cardBody.parameters.some((p) => p.text.includes('{{1}}'))).toBe(false);
    });

    it('uses empty body parameters for static carousel card text', () => {
        const components = getContentProvider('damcorp', carouselPayload);
        const carousel = components.find((c) => c.type === 'carousel');
        const cardBody = carousel.cards[0].components.find((c) => c.type === 'body');

        expect(cardBody.parameters).toEqual([]);
    });

    it('prefers template.components carousel cards with ready-to-send body params', () => {
        const { resolveCarouselCards, getContentProvider: getContent } = require('../src/services/whatsapp/utils/content_utility');

        const request = {
            params_data: ['Rans', '10', '12 Desember 2026', 'Gas'],
            template: {
                type: 'carousel',
                cards: [{
                    components: [{
                        type: 'BODY',
                        text: '✨ Diskon hingga {{1}}% khusus untuk {{2}}',
                    }],
                }],
                components: [{
                    type: 'CAROUSEL',
                    cards: [{
                        card_index: 0,
                        components: [
                            {
                                type: 'HEADER',
                                format: 'IMAGE',
                                parameters: [{ type: 'image', image: { link: 'https://example.com/1.png' } }],
                            },
                            {
                                type: 'BODY',
                                parameters: [
                                    { type: 'text', text: 'Loh' },
                                    { type: 'text', text: 'Iya' },
                                ],
                            },
                        ],
                    }],
                }],
            },
        };

        const resolvedCards = resolveCarouselCards(request, request.params_data);
        expect(resolvedCards[0].components[1].parameters).toEqual([
            { type: 'text', text: 'Loh' },
            { type: 'text', text: 'Iya' },
        ]);

        const output = getContent('damcorp', {
            params: request.params_data,
            carousel_cards: resolvedCards,
        });
        const carousel = output.find((c) => c.type === 'carousel');
        const cardBody = carousel.cards[0].components.find((c) => c.type === 'body');

        expect(cardBody.parameters).toEqual([
            { type: 'text', text: 'Loh' },
            { type: 'text', text: 'Iya' },
        ]);
    });
});
