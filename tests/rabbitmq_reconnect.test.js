const { nextReconnectDelay } = require('../src/config/rabbitmq');

describe('rabbitmq reconnect delay', () => {
    test('backs off until 30s cap', () => {
        expect(nextReconnectDelay(1)).toBe(1000);
        expect(nextReconnectDelay(2)).toBe(2000);
        expect(nextReconnectDelay(3)).toBe(4000);
        expect(nextReconnectDelay(10)).toBe(30000);
    });
});
