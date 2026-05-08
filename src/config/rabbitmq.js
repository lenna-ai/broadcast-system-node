const amqp = require('amqplib');
const path = require('path');
const CONSTANTS = require('./constants');
const envPath = path.join(__dirname, '..', '..', '.env');

require('dotenv').config({ path: envPath });

let connection = null;
let channel = null;

const connectRabbitMQ = async () => {
    if (channel) return channel;

    try {
        console.log('Connecting to RabbitMQ...', process.env.RABBITMQ_URL);
        
        const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
        connection = await amqp.connect(RABBITMQ_URL);
        channel = await connection.createChannel();
        
        await channel.assertExchange(
            CONSTANTS.RABBITMQ.EXCHANGES.DLX, 
            'direct', 
            { durable: true }
        );

        for (const queueName of Object.values(CONSTANTS.RABBITMQ.QUEUES)) {
            const args = {
                'x-queue-type': 'quorum'
            };

            if (queueName !== CONSTANTS.RABBITMQ.QUEUES.FAILED_QUEUE) {
                args['x-dead-letter-exchange'] = CONSTANTS.RABBITMQ.EXCHANGES.DLX;
                args['x-dead-letter-routing-key'] = CONSTANTS.RABBITMQ.ROUTING_KEYS.FAILED;
            }

            await channel.assertQueue(queueName, { 
                durable: true,
                arguments: args
            });
        }

        await channel.bindQueue(
            CONSTANTS.RABBITMQ.QUEUES.FAILED_QUEUE,
            CONSTANTS.RABBITMQ.EXCHANGES.DLX,
            CONSTANTS.RABBITMQ.ROUTING_KEYS.FAILED
        );

        console.log('Global RabbitMQ Channel Established and Queues Asserted');
        return channel;
    } catch (error) {
        console.error('RabbitMQ Connection Failed:', error.message);
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