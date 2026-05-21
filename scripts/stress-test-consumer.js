const RabbitMQManager = require('../src/queue/rabbitmq.manager');
const CONSTANTS = require('../src/config/constants');

const TOTAL_MESSAGES = process.argv[2] || 1000;
const BATCH_SIZE = 100;

async function runConsumerStressTest() {
    console.log(`🚀 Starting Consumer Stress Test...`);
    console.log(`📦 Flooding queue '${CONSTANTS.RABBITMQ.QUEUES.WHATSAPP}' with ${TOTAL_MESSAGES} messages.`);

    try {
        await RabbitMQManager.connect();
        
        const startTime = Date.now();
        let sentCount = 0;

        // Sample payload that replicates a broadcast message
        const payload = {
            recipient: '628123456789',
            integration_id: 1,
            template: {
                template_name: 'hello_world',
                language: 'en'
            },
            broadcast_id: 999,
            sent_by: 1
        };

        for (let i = 0; i < TOTAL_MESSAGES; i += BATCH_SIZE) {
            const batch = [];
            const currentBatchSize = Math.min(BATCH_SIZE, TOTAL_MESSAGES - i);
            
            for (let j = 0; j < currentBatchSize; j++) {
                batch.push(payload);
            }

            // We use publishToQueue if we want to send multiple, 
            // but the worker expects individual messages in the queue usually, 
            // unless the queue manager handles batching.
            // Let's check how rabbitmq.manager handles it.
            
            await Promise.all(batch.map(msg => 
                RabbitMQManager.publishToQueue(CONSTANTS.RABBITMQ.QUEUES.WHATSAPP, msg)
            ));

            sentCount += currentBatchSize;
            process.stdout.write(`\rProgress: ${sentCount}/${TOTAL_MESSAGES} messages sent...`);
        }

        const duration = (Date.now() - startTime) / 1000;
        console.log(`\n\n✅ Done! Sent ${sentCount} messages in ${duration.toFixed(2)}s`);
        console.log(`⚡ Rate: ${Math.round(sentCount / duration)} messages/sec (Producer side)`);
        console.log(`\nNext Steps:`);
        console.log(`1. Run the worker: 'npm run queue'`);
        console.log(`2. Monitor metrics: 'http://localhost:9100/metrics'`);
        console.log(`3. Watch CPU/Memory in your OS monitor or PM2.`);

        process.exit(0);
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    }
}

runConsumerStressTest();
