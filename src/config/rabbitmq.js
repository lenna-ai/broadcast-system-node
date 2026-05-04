const amqp = require('amqplib');
const CONSTANTS = require('./constants');
require('dotenv').config();

let connection = null;
let channel = null;

const connectRabbitMQ = async () => {
    if (channel) return channel;

    try {
        const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost';
        connection = await amqp.connect(RABBITMQ_URL);
        channel = await connection.createChannel();
        
        // Assert all queues from constants
        for (const queueName of Object.values(CONSTANTS.RABBITMQ.QUEUES)) {
            await channel.assertQueue(queueName, { 
                durable: true,
                // Add default arguments if needed, matching what BroadcastPublisher expects
                arguments: queueName !== CONSTANTS.RABBITMQ.QUEUES.FAILED ? {
                    'x-queue-type': 'quorum',
                    'x-dead-letter-exchange': CONSTANTS.RABBITMQ.EXCHANGES.DLX,
                    'x-dead-letter-routing-key': CONSTANTS.RABBITMQ.ROUTING_KEYS.FAILED
                } : {}
            });
        }

        console.log('📦 Global RabbitMQ Channel Established and Queues Asserted');
        return channel;
    } catch (error) {
        console.error('❌ RabbitMQ Connection Failed:', error.message);
        throw error;
    }
};

const getChannel = () => {
    if (!channel) throw new Error("RabbitMQ Channel belum diinisialisasi!");
    return channel;
};

module.exports = { 
    connectRabbitMQ, 
    getChannel,
    url: process.env.RABBITMQ_URL || 'amqp://localhost',
    queues: CONSTANTS.RABBITMQ.QUEUES
};