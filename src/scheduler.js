require('dotenv').config();

const cron = require('node-cron');
const db = require('./config/database');
const RabbitMQManager = require('./queue/rabbitmq_manager');
const CONSTANTS = require('./config/constants');
const { fetchAndPublishRecipients } = require('./helpers/publish_recipients');
const { logCapacityReport } = require('./helpers/capacity');
const { registerGracefulShutdown } = require('./helpers/graceful_shutdown');
const { closeRabbitMQ } = require('./config/rabbitmq');

const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Jakarta';
const CRON_EXPRESSION = process.env.SCHEDULER_CRON || '* * * * *';

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
        console.log(`[scheduler] schedule=${broadcast.id} completed (no recipients)`);
        return;
    }

    await db.raw(
        'UPDATE omnichannel.broadcasts SET status = ? WHERE id = ?',
        ['processing', broadcast.broadcast_id]
    );

    await db.raw(
        'UPDATE omnichannel.broadcast_schedule SET status = ? WHERE id = ?',
        ['completed', broadcast.id]
    );

    console.log(`[scheduler] schedule=${broadcast.id} published=${totalPublished} queue=${queueName}`);
};

const runSchedulerTick = async () => {
    if (isRunning) {
        console.log('[scheduler] skip tick — previous run still in progress');
        return;
    }

    isRunning = true;

    try {
        await RabbitMQManager.connect();

        const pendingBroadcasts = await db.transaction(async (trx) => {
            const { rows } = await trx.raw(
                `SELECT *
                 FROM omnichannel.broadcast_schedule
                 WHERE status = 'pending'
                   AND schedule_at <= timezone(?, now())
                 FOR UPDATE SKIP LOCKED`,
                [APP_TIMEZONE]
            );

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
                console.error(`[scheduler] failed schedule=${broadcast.id}:`, error.message);
                await db.raw(
                    'UPDATE omnichannel.broadcast_schedule SET status = ? WHERE id = ?',
                    ['failed', broadcast.id]
                );
            }
        }
    } catch (error) {
        console.error('[scheduler] error:', error.message);
    } finally {
        isRunning = false;
    }
};

if (!cron.validate(CRON_EXPRESSION)) {
    console.error(`[scheduler] invalid SCHEDULER_CRON: ${CRON_EXPRESSION}`);
    process.exit(1);
}

cron.schedule(CRON_EXPRESSION, runSchedulerTick, { timezone: APP_TIMEZONE });

console.log(`[scheduler] started cron="${CRON_EXPRESSION}" timezone=${APP_TIMEZONE}`);

registerGracefulShutdown(async () => {
    await closeRabbitMQ();
    await db.destroyDb();
});

// Run once on startup so pending items are not waiting a full minute.
runSchedulerTick().catch((error) => {
    console.error('[scheduler] startup tick error:', error.message);
});
