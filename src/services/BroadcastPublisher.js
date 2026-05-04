const { getChannel } = require('../config/rabbitmq');
const CONSTANTS = require('../config/constants');

class BroadcastPublisher {
    
    /**
     * Mengirim payload ke antrean tertentu
     * @param {string} queueName - Nama antrean (dari constants)
     * @param {Object} payload - Data yang mau dikirim
     */
    static async publish(queueName, payload) {
        const channel = getChannel();

        // 🎯 1. Pastikan argument antrean SAMA PERSIS dengan di Worker
        await channel.assertQueue(queueName, {
            durable: true,
            arguments: {
                'x-queue-type': 'quorum',
                'x-dead-letter-exchange': CONSTANTS.RABBITMQ.EXCHANGES.DLX,
                'x-dead-letter-routing-key': CONSTANTS.RABBITMQ.ROUTING_KEYS.FAILED
            }
        });

        // 2. Konversi Object JSON ke Buffer (format biner yang dibaca RabbitMQ)
        const messageBuffer = Buffer.from(JSON.stringify(payload));

        // 3. Tembak ke antrean
        // persistent: true memastikan pesan tidak hilang kalau RabbitMQ tiba-tiba restart
        const isPublished = channel.sendToQueue(queueName, messageBuffer, {
            persistent: true 
        });

        if (!isPublished) {
            throw new Error(`Gagal mempublish ke queue: ${queueName} (Buffer penuh)`);
        }

        return true;
    }
}

module.exports = BroadcastPublisher;