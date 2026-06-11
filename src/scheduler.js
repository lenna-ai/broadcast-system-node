const cron = require('node-cron');
const db = require('./config/database');
const RabbitMQManager = require('./queue/rabbitmq_manager');
const CONSTANTS = require('./config/constants');

const chunkSize = parseInt(process.env.SCHEDULER_CHUNK_SIZE, 10) || 50;
let isRunning = false;

const processSchedule = async (broadcast) => {
    const { rows: recipients } = await db.raw(
        `SELECT id, phone, payload
         FROM omnichannel.broadcast_recipients
         WHERE broadcast_id = ?`,
        [broadcast.broadcast_id]
    );

    if (recipients.length === 0) {
        await db.raw(
            'UPDATE omnichannel.broadcast_schedule SET status = ? WHERE id = ?',
            ['completed', broadcast.id]
        );
        return;
    }

    for (let i = 0; i < recipients.length; i += chunkSize) {
        const batch = recipients.slice(i, i + chunkSize).map((r) => r.payload);
        await RabbitMQManager.publishToQueue(CONSTANTS.RABBITMQ.QUEUES.WHATSAPP, batch);
    }

    await db.raw(
        'UPDATE omnichannel.broadcasts SET status = ? WHERE id = ?',
        ['processing', broadcast.broadcast_id]
    );
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
