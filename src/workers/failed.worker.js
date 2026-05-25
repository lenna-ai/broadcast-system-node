const RabbitMQManager = require('../queue/rabbitmq.manager');
const CONSTANTS = require('../config/constants');
const BroadcastListener = require('../services/BroadcastListener');
const { poolConfig } = require('../config/database');
const { runWithConcurrencyLimit } = require('../helpers/concurrency');

const startWorker = async () => {
    await RabbitMQManager.connect();
    console.log(`[*] Failed worker DB pool max=${poolConfig.max}`);

    RabbitMQManager.failedConsumer(CONSTANTS.RABBITMQ.QUEUES.FAILED_QUEUE, async (data) => {
        console.log(`Processing failed batch ${data.length} data...`);
        await runWithConcurrencyLimit(data, async (item) => {
            await BroadcastListener.failed(item);
        }, poolConfig.max);
    });
};

startWorker();