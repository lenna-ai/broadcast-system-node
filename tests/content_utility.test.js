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
});
