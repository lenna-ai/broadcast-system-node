const RabbitMQManager = require('../queue/rabbitmq_manager');
const CONSTANTS = require('../config/constants');
const BroadcastListener = require('../services/broadcast_listener');
const { broadcastCounter } = require('../config/metrics');
const db = require('../config/database');
const { closeRabbitMQ } = require('../config/rabbitmq');
const { runWithConcurrencyLimit } = require('./concurrency');
const { normalizeWhatsappQueuePayload } = require('./failed_message');
const { registerGracefulShutdown } = require('./graceful_shutdown');
const { logCapacityReport, capToPool } = require('./capacity');
const { setTimeout: sleep } = require('timers/promises');

const parseIntEnv = (key, fallback) => {
    const value = parseInt(process.env[key], 10);
    return Number.isFinite(value) ? value : fallback;
};

const chunkArray = (items, size) => {
    const chunks = [];
    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
    }
    return chunks;
};

const startQueueWorker = ({
    queueName,
    label,
    throttleEnvKey = 'BROADCAST_THROTTLE_MS',
}) => {
    const { poolConfig } = db;
    const prefetchCount = capToPool(
        parseIntEnv('RABBITMQ_PREFETCH', poolConfig.max),
        poolConfig.max
    );
    const throttleMs = parseIntEnv(throttleEnvKey, parseIntEnv('BROADCAST_THROTTLE_MS', 50));
    const maxBatchSize = parseIntEnv('MAX_QUEUE_BATCH_SIZE', 25);
    const concurrency = prefetchCount;

    const start = async () => {
        await RabbitMQManager.connect();
        logCapacityReport(label);

        console.log(
            `[${label}] queue=${queueName} pool_max=${poolConfig.max} ` +
            `prefetch=${prefetchCount} concurrency=${concurrency} throttle=${throttleMs}ms`
        );

        RabbitMQManager.consumer(queueName, async (rawContent) => {
            const batchData = normalizeWhatsappQueuePayload(rawContent);
            const failedItems = [];

            const batches = batchData.length > maxBatchSize
                ? chunkArray(batchData, maxBatchSize)
                : [batchData];

            for (const batch of batches) {
                await runWithConcurrencyLimit(batch, async (item) => {
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
                }, concurrency);
            }

            for (const failedItem of failedItems) {
                await RabbitMQManager.publishToQueue(
                    CONSTANTS.RABBITMQ.QUEUES.FAILED_QUEUE,
                    failedItem
                );
            }
        }, prefetchCount);

        registerGracefulShutdown(async () => {
            await closeRabbitMQ();
            await db.destroyDb();
        });
    };

    return start().catch((error) => {
        console.error(`[${label}] startup error:`, error.message);
        process.exit(1);
    });
};

module.exports = { startQueueWorker };
