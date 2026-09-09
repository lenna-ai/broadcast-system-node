const amqp = require('amqplib');
const path = require('path');
const { setTimeout: sleep } = require('timers/promises');
const CONSTANTS = require('./constants');

const envPath = path.join(__dirname, '..', '..', '.env');
require('dotenv').config({ path: envPath });

let connection = null;
let channel = null;
let intentionalClose = false;
let reconnectPromise = null;
const reconnectHandlers = [];

const parseHeartbeat = () => {
    const value = parseInt(process.env.RABBITMQ_HEARTBEAT, 10);
    return Number.isFinite(value) && value > 0 ? value : 30;
};

const nextReconnectDelay = (attempt) => Math.min(1000 * (2 ** (attempt - 1)), 30000);

const onReconnected = (handler) => {
    if (typeof handler === 'function') {
        reconnectHandlers.push(handler);
    }
};

const notifyReconnected = async () => {
    for (const handler of reconnectHandlers) {
        try {
            await handler();
        } catch (error) {
            console.error('RabbitMQ reconnect handler failed:', error.message);
        }
    }
};

const setupTopology = async (mqChannel) => {
    await mqChannel.assertExchange(
        CONSTANTS.RABBITMQ.EXCHANGES.DLX,
        'direct',
        { durable: true }
    );

    for (const queueName of Object.values(CONSTANTS.RABBITMQ.QUEUES)) {
        const args = {
            'x-queue-type': 'quorum',
        };

        if (queueName !== CONSTANTS.RABBITMQ.QUEUES.FAILED_QUEUE) {
            args['x-dead-letter-exchange'] = CONSTANTS.RABBITMQ.EXCHANGES.DLX;
            args['x-dead-letter-routing-key'] = CONSTANTS.RABBITMQ.ROUTING_KEYS.FAILED;
        }

        await mqChannel.assertQueue(queueName, {
            durable: true,
            arguments: args,
        });
    }

    await mqChannel.bindQueue(
        CONSTANTS.RABBITMQ.QUEUES.FAILED_QUEUE,
        CONSTANTS.RABBITMQ.EXCHANGES.DLX,
        CONSTANTS.RABBITMQ.ROUTING_KEYS.FAILED
    );
};

const attachConnectionHandlers = (conn) => {
    conn.on('error', (error) => {
        console.error('RabbitMQ connection error:', error.message);
    });

    conn.on('close', () => {
        connection = null;
        channel = null;
        if (intentionalClose) return;
        console.error('RabbitMQ connection closed, reconnecting...');
        reconnectRabbitMQ();
    });
};

const openConnection = async () => {
    const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
    console.log('Connecting to RabbitMQ...');

    const conn = await amqp.connect(RABBITMQ_URL, { heartbeat: parseHeartbeat() });
    try {
        const mqChannel = await conn.createChannel();
        mqChannel.on('error', (error) => {
            console.error('RabbitMQ channel error:', error.message);
        });
        await setupTopology(mqChannel);
        connection = conn;
        channel = mqChannel;
        attachConnectionHandlers(conn);
        console.log('Global RabbitMQ Channel Established and Queues Asserted');
        return mqChannel;
    } catch (error) {
        try {
            await conn.close();
        } catch {
            // ignore
        }
        throw error;
    }
};

const reconnectRabbitMQ = () => {
    if (intentionalClose || reconnectPromise) return reconnectPromise;

    const current = (async () => {
        let attempt = 1;
        while (!intentionalClose) {
            try {
                await sleep(nextReconnectDelay(attempt));
                const mqChannel = await openConnection();
                await notifyReconnected();
                if (!channel) {
                    throw new Error('RabbitMQ connection dropped during consumer restore');
                }
                return mqChannel;
            } catch (error) {
                console.error(`RabbitMQ reconnect attempt ${attempt} failed:`, error.message);
                attempt += 1;
            }
        }
        return null;
    })();

    reconnectPromise = current;
    current.finally(() => {
        if (reconnectPromise === current) {
            reconnectPromise = null;
        }
        if (!channel && !intentionalClose) {
            reconnectRabbitMQ();
        }
    });

    return current;
};

const connectRabbitMQ = async () => {
    if (channel) return channel;
    if (reconnectPromise) return reconnectPromise;
    intentionalClose = false;
    try {
        return await openConnection();
    } catch (error) {
        console.error('RabbitMQ initial connect failed:', error.message);
        return reconnectRabbitMQ();
    }
};

const getChannel = () => {
    if (!channel) throw new Error('RabbitMQ channel is not initialized');
    return channel;
};

const getChannelOrConnect = async () => {
    if (channel) return channel;
    return connectRabbitMQ();
};

const closeRabbitMQ = async () => {
    intentionalClose = true;

    try {
        if (channel) await channel.close();
    } catch (error) {
        console.error('Error closing RabbitMQ channel:', error.message);
    }

    try {
        if (connection) await connection.close();
    } catch (error) {
        console.error('Error closing RabbitMQ connection:', error.message);
    }

    channel = null;
    connection = null;
};

module.exports = {
    connectRabbitMQ,
    closeRabbitMQ,
    getChannel,
    getChannelOrConnect,
    onReconnected,
    nextReconnectDelay,
    url: process.env.RABBITMQ_URL || 'amqp://localhost',
    queues: CONSTANTS.RABBITMQ.QUEUES,
};
