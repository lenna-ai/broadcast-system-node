const RabbitMQManager = require('../queue/rabbitmq_manager');
const CONSTANTS = require('../config/constants');
const BroadcastListener = require('../services/broadcast_listener');
const { broadcastCounter } = require('../config/metrics');
const db = require('../config/database');
const { closeRabbitMQ } = require('../config/rabbitmq');
const { runWithConcurrencyLimit } = require('../helpers/concurrency');
const { normalizeWhatsappQueuePayload } = require('../helpers/failed_message');
const { registerGracefulShutdown } = require('../helpers/graceful_shutdown');
const { setTimeout: sleep } = require('timers/promises');

const { poolConfig } = db;
const prefetchCount = parseInt(process.env.RABBITMQ_PREFETCH, 10) || poolConfig.max;
const throttleMs = parseInt(process.env.BROADCAST_THROTTLE_MS, 10) || 50;

const startWorker = async () => {
    await RabbitMQManager.connect();
    console.log(`[queue-worker] DB pool max=${poolConfig.max}, prefetch=${prefetchCount}, throttle=${throttleMs}ms`);

    RabbitMQManager.consumer(CONSTANTS.RABBITMQ.QUEUES.WHATSAPP, async (rawContent) => {
        const batchData = normalizeWhatsappQueuePayload(rawContent);
        const failedItems = [];

        await runWithConcurrencyLimit(batchData, async (item) => {
            try {
                await BroadcastListener.listen(item);
                broadcastCounter.inc({ status: 'success' });
                if (throttleMs > 0) await sleep(throttleMs);
            } catch (error) {
                failedItems.push({
                    data: item,
                    error_reason: error.message,
                    failed_at: new Date().toISOString(),
                });
                broadcastCounter.inc({ status: 'failed' });
            }
        }, poolConfig.max);

        for (const failedItem of failedItems) {
            await RabbitMQManager.publishToQueue(CONSTANTS.RABBITMQ.QUEUES.FAILED_QUEUE, failedItem);
        }
    }, prefetchCount);

    registerGracefulShutdown(async () => {
        await closeRabbitMQ();
        await db.destroyDb();
    });
};

startWorker().catch((error) => {
    console.error('Queue worker startup error:', error.message);
    process.exit(1);
});
