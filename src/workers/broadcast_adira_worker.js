const CONSTANTS = require('../config/constants');
const { startQueueWorker } = require('../helpers/queue_worker');

startQueueWorker({
    queueName: CONSTANTS.RABBITMQ.QUEUES.WHATSAPP_ADIRA,
    label: 'adira-worker',
    throttleEnvKey: 'BROADCAST_ADIRA_THROTTLE_MS',
});
