const RabbitMQManager = require('../queue/rabbitmq.manager');
const CONSTANTS = require('../config/constants');
const BroadcastListener = require('../services/BroadcastListener');
const { broadcastCounter } = require('../config/metrics'); // Import helper metrik
const { setTimeout: sleep } = require('timers/promises');
const startWorker = async () => {
    await RabbitMQManager.connect();
    RabbitMQManager.consumer(CONSTANTS.RABBITMQ.QUEUES.WHATSAPP, async (batchData) => {
        console.log(`Received batch ${batchData.length} data...`);

        const failedItems = [];
        await Promise.all(batchData.map(async (item) => {
            try {
                await BroadcastListener.listen(item);
                broadcastCounter.inc({ status: 'success' }); // Increment counter jika sukses
                await sleep(50);
            } catch (error) {
                failedItems.push({
                    data: item,
                    error_reason: error.message,
                    failed_at: new Date().toISOString()
                });
                broadcastCounter.inc({ status: 'failed' }); // Increment counter jika gagal
            }
        }));
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

        if (failedItems.length > 0) {
            // PUBLISH TO FAILED_QUEUE
            await RabbitMQManager.publishToQueue(CONSTANTS.RABBITMQ.QUEUES.FAILED_QUEUE, failedItems);
        }
    });
};

startWorker();