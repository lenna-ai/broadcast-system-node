const RabbitMQManager = require('../queue/rabbitmq_manager');
const CONSTANTS = require('../config/constants');
const BroadcastListener = require('../services/broadcast_listener');
const { broadcastCounter } = require('../config/metrics');
const { poolConfig } = require('../config/database');
const { runWithConcurrencyLimit } = require('../helpers/concurrency');
const { normalizeWhatsappQueuePayload } = require('../helpers/failed_message');
const { setTimeout: sleep } = require('timers/promises');

const prefetchCount = parseInt(process.env.RABBITMQ_PREFETCH, 10) || poolConfig.max;

const startWorker = async () => {
    await RabbitMQManager.connect();
    console.log(`[*] DB pool max=${poolConfig.max}, RabbitMQ prefetch=${prefetchCount}`);

    RabbitMQManager.consumer(CONSTANTS.RABBITMQ.QUEUES.WHATSAPP, async (rawContent) => {
        const batchData = normalizeWhatsappQueuePayload(rawContent);
        console.log(`Received batch ${batchData.length} data...`);

        const failedItems = [];
        await runWithConcurrencyLimit(batchData, async (item) => {
            try {
                await BroadcastListener.listen(item);
                broadcastCounter.inc({ status: 'success' });
                await sleep(50);
            } catch (error) {
                failedItems.push({
                    data: item,
                    error_reason: error.message,
                    failed_at: new Date().toISOString()
                });
                broadcastCounter.inc({ status: 'failed' });
            }
        }, poolConfig.max);
        // for (const [index, item] of batchData.entries()) {
        //     try {
        //         // 1. Kirim API satu per satu
        //         await BroadcastListener.listen(item);
        //         await sleep(50); 
                
        //     } catch (error) {
        //         failedItems.push({
        //             data: item,
        //             error_reason: error.message,
        //             failed_at: new Date().toISOString()
        //         });
        //     }
        // }

        for (const failedItem of failedItems) {
            await RabbitMQManager.publishToQueue(CONSTANTS.RABBITMQ.QUEUES.FAILED_QUEUE, failedItem);
        }
    }, prefetchCount);
};

startWorker();