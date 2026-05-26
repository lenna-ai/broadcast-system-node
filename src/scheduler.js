const cron = require('node-cron');
const db = require('./config/database'); // 🌟 Destructuring ambil 'db' Knex
const RabbitMQManager = require('./queue/rabbitmq.manager');
const CONSTANTS = require('./config/constants');

cron.schedule('* * * * *', async () => {
    try {
        await RabbitMQManager.connect();

        // 🌟 GANTI db.query MENJADI db.raw
        const queryText = `
            SELECT * FROM omnichannel.broadcast_schedule 
            WHERE status = 'pending' AND schedule_at <= NOW()
            FOR UPDATE SKIP LOCKED
        `; 

        // Knex .raw() mengembalikan objek yang struktur baris datanya ada di properti .rows (khusus PostgreSQL)
        const { rows: pendingBroadcasts } = await db.raw(queryText);

        for (const broadcast of pendingBroadcasts) {
            console.log(`\n📦 Processing Broadcast Schedule ID: ${broadcast.id}`);

            // 🌟 Jalankan UPDATE menggunakan Knex Raw
            await db.raw(
                'UPDATE omnichannel.broadcast_schedule SET status = ?, start_at = NOW() WHERE id = ?', 
                ['processing', broadcast.id]
            );

            const recipientQuery = `
                SELECT id, phone, payload
                FROM omnichannel.broadcast_recipients 
                WHERE broadcast_id = ?
            `;
       
            const { rows: recipients } = await db.raw(recipientQuery, [broadcast.broadcast_id]);
            if (recipients.length === 0) {
                await db.raw('UPDATE omnichannel.broadcast_schedule SET status = ? WHERE id = ?', ['completed', broadcast.id]);
                continue;
            }

            // Pecah data recipients menjadi beberapa batch (maksimal 100 data)
            const chunkSize = 100;
            const batches = [];
            for (let i = 0; i < recipients.length; i += chunkSize) {
                batches.push(recipients.slice(i, i + chunkSize));
            }
            // Push setiap batch ke antrean RabbitMQ
            for (const batch of batches) {
                const queuePayload = batch.map(r => (r.payload));
                await RabbitMQManager.publishToQueue(CONSTANTS.RABBITMQ.QUEUES.WHATSAPP, queuePayload);
            }

            await db.raw(
                'UPDATE omnichannel.broadcasts SET status = ? WHERE id = ?', 
                ['processing', broadcast.broadcast_id]
            );
        }

    } catch (error) {
        console.error('💥 Scheduler Error:', error.message);
    }
});