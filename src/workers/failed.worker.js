const RabbitMQManager = require('../queue/rabbitmq.manager');
const CONSTANTS = require('../config/constants');
const BroadcastListener = require('../services/BroadcastListener');

const startWorker = async () => {
    await RabbitMQManager.connect();
    RabbitMQManager.failedConsumer(CONSTANTS.RABBITMQ.QUEUES.FAILED_QUEUE, async (data) => {
        console.log(`Processing failed batch ${data.length} data...`);
        await Promise.all(data.map(async (item) => {
            await BroadcastListener.failed(item);
        }));
    })
};

startWorker();