const BroadcastPublisher = require('./BroadcastPublisher');
const BroadcastListener = require('./BroadcastListener');
const CONSTANTS = require('../config/constants');

class BroadcastManager {
    static async publish(request) {
        try {
            if (!request || !request.type || !request.payload) {
                return { status: 'error', message: 'Payload tidak lengkap (membutuhkan type dan payload)' };
            }

            const { type, payload } = request;
            let queueName;

            switch (type) {
                case 'whatsapp':
                    queueName = CONSTANTS.RABBITMQ.QUEUES.WHATSAPP;
                    break;
                case 'email':
                    queueName = CONSTANTS.RABBITMQ.QUEUES.EMAIL;
                    break;
                case 'lead':
                    queueName = CONSTANTS.RABBITMQ.QUEUES.LEADS;
                    break;
                default:
                    return { status: 'error', message: `Tipe broadcast '${type}' tidak didukung` };
            }

            await BroadcastPublisher.publish(queueName, payload);
            return { status: 'success', message: `Broadcast ${type} berhasil dikirim ke antrean` };
        } catch (error) {
            console.error('BroadcastManager Publish Error:', error.message);
            return { status: 'error', message: error.message };
        }
    }

    static async listen(request) {
        try {
            if (!request || !request.integration_id) {
                 return { status: 'error', message: 'Broadcast failed — No integration selected'};
            }

            const result = await BroadcastListener.listen(request, request.data || []);
            return { status: 'success', ...result };
        } catch (error) {
            console.error('BroadcastManager Listen Error:', error.message);
            return { status: 'error', message: error.message };
        }
    }

    static async failed(request) {
        try {
            const result = await BroadcastListener.failed(request, request.data || []);
            return { status: 'success', ...result };
        } catch (error) {
            console.error('BroadcastManager Failed Error:', error.message);
        }
    }
}

module.exports = BroadcastManager;
