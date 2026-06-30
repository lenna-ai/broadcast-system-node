const CONSTANTS = require('../config/constants');
const { startQueueWorker } = require('../helpers/queue_worker');

startQueueWorker({
    queueName: CONSTANTS.RABBITMQ.QUEUES.WHATSAPP,
    label: 'queue-worker',
});
