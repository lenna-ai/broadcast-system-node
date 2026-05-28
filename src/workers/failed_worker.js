const RabbitMQManager = require('../queue/rabbitmq_manager');
const CONSTANTS = require('../config/constants');
const BroadcastListener = require('../services/broadcast_listener');
const { poolConfig } = require('../config/database');
const { runWithConcurrencyLimit } = require('../helpers/concurrency');
const { normalizeFailedQueuePayload } = require('../helpers/failed_message');

const failedPrefetch = parseInt(process.env.RABBITMQ_FAILED_PREFETCH, 10) || 5;

const startWorker = async () => {
    await RabbitMQManager.connect();
    console.log(`[*] Failed worker DB pool max=${poolConfig.max}`);

    RabbitMQManager.failedConsumer(
        CONSTANTS.RABBITMQ.QUEUES.FAILED_QUEUE,
        async (rawContent) => {
            const failedItems = normalizeFailedQueuePayload(rawContent);
            console.log(`Processing ${failedItems.length} failed item(s)...`);

            await runWithConcurrencyLimit(failedItems, async (item) => {
                await BroadcastListener.failed(item);
            }, poolConfig.max);
        },
        failedPrefetch
    );
};

startWorker().catch((error) => {
    console.error('Failed worker startup error:', error.message);
    process.exit(1);
});