const { setTimeout: sleep } = require('timers/promises');

const parseIntEnv = (key, fallback) => {
    const value = parseInt(process.env[key], 10);
    return Number.isFinite(value) ? value : fallback;
};

/**
 * Publish recipients to RabbitMQ in small batches with pagination-friendly chunking.
 */
const publishRecipientBatches = async (rabbitMQManager, queueName, payloads) => {
    const chunkSize = parseIntEnv('SCHEDULER_CHUNK_SIZE', 25);
    const maxBatchSize = parseIntEnv('MAX_QUEUE_BATCH_SIZE', 25);
    const publishDelayMs = parseIntEnv('SCHEDULER_PUBLISH_DELAY_MS', 10);
    const effectiveChunk = Math.min(chunkSize, maxBatchSize);

    for (let i = 0; i < payloads.length; i += effectiveChunk) {
        const batch = payloads.slice(i, i + effectiveChunk);
        await rabbitMQManager.publishToQueue(queueName, batch.length === 1 ? batch[0] : batch);

        if (publishDelayMs > 0 && i + effectiveChunk < payloads.length) {
            await sleep(publishDelayMs);
        }
    }
};

/**
 * Stream recipients from DB using keyset pagination (safe for 10k–100k+ rows).
 */
const fetchAndPublishRecipients = async (db, rabbitMQManager, queueName, broadcastId) => {
    const pageSize = parseIntEnv('SCHEDULER_RECIPIENT_PAGE_SIZE', 1000);
    let lastId = 0;
    let totalPublished = 0;

    while (true) {
        const { rows } = await db.raw(
            `SELECT id, payload
             FROM omnichannel.broadcast_recipients
             WHERE broadcast_id = ? AND id > ?
             ORDER BY id ASC
             LIMIT ?`,
            [broadcastId, lastId, pageSize]
        );

        if (!rows.length) break;

        const payloads = rows.map((row) => {
            const value = row.payload;
            if (typeof value === 'string') {
                try {
                    return JSON.parse(value);
                } catch {
                    return value;
                }
            }
            return value;
        });
        await publishRecipientBatches(rabbitMQManager, queueName, payloads);

        totalPublished += rows.length;
        lastId = rows[rows.length - 1].id;
    }

    return totalPublished;
};

module.exports = {
    publishRecipientBatches,
    fetchAndPublishRecipients,
};
