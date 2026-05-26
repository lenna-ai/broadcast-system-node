const {
    normalizeFailedQueuePayload,
    normalizeWhatsappQueuePayload,
} = require('../src/helpers/failedMessage');

describe('failedMessage helpers', () => {
    test('normalizeWhatsappQueuePayload wraps single object', () => {
        const payload = { integration_id: 1 };
        expect(normalizeWhatsappQueuePayload(payload)).toEqual([payload]);
    });

    test('normalizeFailedQueuePayload keeps wrapped failed items', () => {
        const items = [{
            data: { recipient: '6281', integration_id: 1 },
            error_reason: 'API error',
            failed_at: '2026-01-01T00:00:00.000Z',
        }];
        expect(normalizeFailedQueuePayload(items)).toEqual(items);
    });

    test('normalizeFailedQueuePayload wraps broadcast batch from DLX', () => {
        const batch = [{ recipient: '6281' }, { recipient: '6282' }];
        const result = normalizeFailedQueuePayload(batch);
        expect(result).toHaveLength(2);
        expect(result[0].data.recipient).toBe('6281');
        expect(result[0].error_reason).toBeTruthy();
    });

    test('normalizeFailedQueuePayload wraps single broadcast payload', () => {
        const result = normalizeFailedQueuePayload({ recipient: '6281' });
        expect(result).toHaveLength(1);
        expect(result[0].data.recipient).toBe('6281');
    });
});
