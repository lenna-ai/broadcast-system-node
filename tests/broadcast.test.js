// Mock dependencies that use ESM or DB
jest.mock('../src/repositories/Broadcast.repositories', () => ({
    sendBroadcast: jest.fn(),
    saveBroadcastMessage: jest.fn()
}));
jest.mock('../src/repositories/ExternalApi.repositories', () => ({
    getExternalApi: jest.fn(),
    getExternalApiWithEndpoints: jest.fn()
}));
jest.mock('../src/repositories/Log.repositories', () => ({
    saveLog: jest.fn()
}));

const BroadcastManager = require('../src/services/BroadcastManager');
const BroadcastPublisher = require('../src/services/BroadcastPublisher');
const CONSTANTS = require('../src/config/constants');

// Mock BroadcastPublisher
jest.mock('../src/services/BroadcastPublisher');

describe('BroadcastManager', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('publish', () => {
        it('should return error if payload is missing', async () => {
            const response = await BroadcastManager.publish({});
            expect(response.status).toBe('error');
            expect(response.message).toContain('Payload tidak lengkap');
        });

        it('should return error if type is not supported', async () => {
            const request = {
                type: 'invalid_type',
                payload: { message: 'hello' }
            };
            const response = await BroadcastManager.publish(request);
            expect(response.status).toBe('error');
            expect(response.message).toContain('tidak didukung');
        });

        it('should successfully publish whatsapp broadcast', async () => {
            const request = {
                type: 'whatsapp',
                payload: { message: 'hello whatsapp' }
            };
            
            BroadcastPublisher.publish.mockResolvedValue(true);

            const response = await BroadcastManager.publish(request);
            
            expect(response.status).toBe('success');
            expect(response.message).toContain('whatsapp berhasil dikirim');
            expect(BroadcastPublisher.publish).toHaveBeenCalledWith(
                CONSTANTS.RABBITMQ.QUEUES.WHATSAPP,
                request.payload
            );
        });

        it('should successfully publish email broadcast', async () => {
            const request = {
                type: 'email',
                payload: { message: 'hello email' }
            };
            
            BroadcastPublisher.publish.mockResolvedValue(true);

            const response = await BroadcastManager.publish(request);
            
            expect(response.status).toBe('success');
            expect(response.message).toContain('email berhasil dikirim');
            expect(BroadcastPublisher.publish).toHaveBeenCalledWith(
                CONSTANTS.RABBITMQ.QUEUES.EMAIL,
                request.payload
            );
        });

        it('should throw error if BroadcastPublisher fails', async () => {
            const request = {
                type: 'whatsapp',
                payload: { message: 'hello' }
            };
            
            BroadcastPublisher.publish.mockRejectedValue(new Error('RabbitMQ connection failed'));

            await expect(BroadcastManager.publish(request)).rejects.toThrow('RabbitMQ connection failed');
        });
    });
});
