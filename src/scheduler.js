const cron = require('node-cron');
const db = require('./config/database');
const RabbitMQManager = require('./queue/rabbitmq_manager');
const CONSTANTS = require('./config/constants');
const { fetchAndPublishRecipients } = require('./helpers/publish_recipients');
const { logCapacityReport } = require('./helpers/capacity');

let isRunning = false;

const resolveQueueName = (broadcast) => {
    const client = (broadcast.client || broadcast.provider || '').toLowerCase();
    if (client.includes('adira')) {
        return CONSTANTS.RABBITMQ.QUEUES.WHATSAPP_ADIRA;
    }
    return CONSTANTS.RABBITMQ.QUEUES.WHATSAPP;
};

const processSchedule = async (broadcast) => {
    const queueName = resolveQueueName(broadcast);
    const totalPublished = await fetchAndPublishRecipients(
        db,
        RabbitMQManager,
        queueName,
        broadcast.broadcast_id
    );

    if (totalPublished === 0) {
        await db.raw(
            'UPDATE omnichannel.broadcast_schedule SET status = ? WHERE id = ?',
            ['completed', broadcast.id]
        );
        return;
    }

    await db.raw(
        'UPDATE omnichannel.broadcasts SET status = ? WHERE id = ?',
        ['processing', broadcast.broadcast_id]
    );

    console.log(`[scheduler] schedule=${broadcast.id} published=${totalPublished} queue=${queueName}`);
};

cron.schedule('* * * * *', async () => {
    if (isRunning) return;
    isRunning = true;

    try {
        await RabbitMQManager.connect();

        const pendingBroadcasts = await db.transaction(async (trx) => {
            const { rows } = await trx.raw(`
                SELECT * FROM omnichannel.broadcast_schedule
                WHERE status = 'pending' AND schedule_at <= NOW()
                FOR UPDATE SKIP LOCKED
            `);

            for (const broadcast of rows) {
                await trx.raw(
                    'UPDATE omnichannel.broadcast_schedule SET status = ? WHERE id = ?',
                    ['processing', broadcast.id]
                );
            }

            return rows;
        });

        if (pendingBroadcasts.length > 0) {
            logCapacityReport('scheduler');
        }

        for (const broadcast of pendingBroadcasts) {
            try {
                await processSchedule(broadcast);
            } catch (error) {
                console.error(`Scheduler failed for schedule ID ${broadcast.id}:`, error.message);
                await db.raw(
                    'UPDATE omnichannel.broadcast_schedule SET status = ? WHERE id = ?',
                    ['failed', broadcast.id]
                );
            }
        }
    } catch (error) {
        console.error('Scheduler error:', error.message);
    } finally {
        isRunning = false;
    }
});
