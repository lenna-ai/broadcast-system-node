const RabbitMQManager = require('../queue/rabbitmq_manager');
const CONSTANTS = require('../config/constants');
const BroadcastListener = require('../services/broadcast_listener');
const db = require('../config/database');
const { closeRabbitMQ } = require('../config/rabbitmq');
const { runWithConcurrencyLimit } = require('../helpers/concurrency');
const { normalizeFailedQueuePayload } = require('../helpers/failed_message');
const { registerGracefulShutdown } = require('../helpers/graceful_shutdown');

const { poolConfig } = db;
const failedPrefetch = parseInt(process.env.RABBITMQ_FAILED_PREFETCH, 10) || 5;

const startWorker = async () => {
    await RabbitMQManager.connect();
    console.log(`[dlq-worker] DB pool max=${poolConfig.max}, prefetch=${failedPrefetch}`);

    RabbitMQManager.failedConsumer(
        CONSTANTS.RABBITMQ.QUEUES.FAILED_QUEUE,
        async (rawContent) => {
            const failedItems = normalizeFailedQueuePayload(rawContent);

            await runWithConcurrencyLimit(failedItems, async (item) => {
                await BroadcastListener.failed(item);
            }, poolConfig.max);
        },
        failedPrefetch
    );

    registerGracefulShutdown(async () => {
        await closeRabbitMQ();
        await db.destroyDb();
    });
};

startWorker().catch((error) => {
    console.error('DLQ worker startup error:', error.message);
    process.exit(1);
});
