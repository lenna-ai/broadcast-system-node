// Mock repositories to avoid ESM/DB issues
jest.mock('../src/repositories/broadcast_repository', () => ({
    sendBroadcast: jest.fn(),
    saveBroadcastMessage: jest.fn()
}));
jest.mock('../src/repositories/external_api_repository', () => ({
    getExternalApi: jest.fn(),
    getExternalApiWithEndpoints: jest.fn()
}));

const request = require('supertest');
const app = require('../app');
const BroadcastManager = require('../src/services/broadcast_manager');

// Mock BroadcastManager
jest.mock('../src/services/broadcast_manager');

describe('Broadcast API', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('POST /api/broadcast/publish', () => {
        it('should return 200 and success message when publishing is successful', async () => {
            const payload = {
                type: 'whatsapp',
                payload: { message: 'test' }
            };

            BroadcastManager.publish.mockResolvedValue({
                status: 'success',
                message: 'Broadcast whatsapp berhasil dikirim ke antrean'
            });

            const response = await request(app)
                .post('/api/broadcast/publish')
                .send(payload);

            expect(response.status).toBe(200);
            expect(response.body.status).toBe('success');
            expect(response.body.message).toContain('berhasil dikirim');
        });

        it('should return 500 when BroadcastManager returns error', async () => {
            const payload = {
                type: 'invalid',
                payload: { message: 'test' }
            };

            BroadcastManager.publish.mockResolvedValue({
                status: 'error',
                message: 'Tipe broadcast tidak didukung'
            });

            const response = await request(app)
                .post('/api/broadcast/publish')
                .send(payload);

            expect(response.status).toBe(500);
            expect(response.body.status).toBe('error');
        });

        it('should return 207 when BroadcastManager returns partial_success', async () => {
            const payload = {
                type: 'whatsapp',
                payload: { message: 'test' }
            };

            BroadcastManager.publish.mockResolvedValue({
                status: 'partial_success',
                message: 'Beberapa pesan gagal dikirim'
            });

            const response = await request(app)
                .post('/api/broadcast/publish')
                .send(payload);

            expect(response.status).toBe(207);
        });
    });

    describe('POST /api/broadcast/listen', () => {
        it('should return 200 when listening is successful', async () => {
            const payload = {
                integration_id: '123',
                data: [{ phone: '628123', message: 'test' }]
            };

            BroadcastManager.listen.mockResolvedValue({
                success: true,
                processed: 1
            });

            const response = await request(app)
                .post('/api/broadcast/listen')
                .send(payload);

            expect(response.status).toBe(200);
            expect(response.body.message).toBe('The message was successfully processed');
        });

        it('should return 500 when listening fails', async () => {
            const payload = {
                integration_id: '123'
            };

            BroadcastManager.listen.mockRejectedValue(new Error('Processing error'));

            const response = await request(app)
                .post('/api/broadcast/listen')
                .send(payload);

            expect(response.status).toBe(500);
            expect(response.body.success).toBe(false);
            expect(response.body.message).toBe('Processing error');
        });
    });
});
