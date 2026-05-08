const RabbitMQManager = require('../queue/rabbitmq.manager');
const CONSTANTS = require('../config/constants');
const BroadcastListener = require('../services/BroadcastListener');

const startWorker = async () => {
    await RabbitMQManager.connect();
    RabbitMQManager.consumer(CONSTANTS.RABBITMQ.QUEUES.WHATSAPP, async (batchData) => {
        console.log(`Received batch ${batchData.length} data...`);

        const failedItems = [];
        await Promise.all(batchData.map(async (item) => {
            try {
                await BroadcastListener.listen(item);
            } catch (error) {
                failedItems.push({
                    data: item,
                    error_reason: error.message,
                    failed_at: new Date().toISOString()
                });
            }
        }));

        if (failedItems.length > 0) {
            // PUBLISH TO FAILED_QUEUE
            await RabbitMQManager.publishToQueue(CONSTANTS.RABBITMQ.QUEUES.FAILED_QUEUE, failedItems);
        }
    });

    RabbitMQManager.failedConsumer(CONSTANTS.RABBITMQ.QUEUES.FAILED_QUEUE, async (data) => {

        console.log(`Received failed batch ${data.length} data...`);
        await Promise.all(data.map(async (item) => {
            await BroadcastListener.failed(item);
        }));
    })
};

startWorker();