const { connectRabbitMQ, getChannel } = require('../config/rabbitmq');
const CONSTANTS = require('../config/constants'); // Sesuaikan path

class RabbitMQManager {
  async connect() {
    return connectRabbitMQ();
  }

  async publishToQueue(queueName, message) {
    const channel = getChannel();
    
    return channel.sendToQueue(
      queueName,
      Buffer.from(JSON.stringify(message)),
      { persistent: true }
    );
  }

  async consumer(queueName, callback, prefetchCount = 20) {
    const channel = getChannel();
    channel.prefetch(prefetchCount);

    console.log(`[*] Waiting messages in queue: ${queueName} (Prefetch: ${prefetchCount})`);
    
    return channel.consume(queueName, async (msg) => {
      if (msg !== null) {
        try {
          const content = JSON.parse(msg.content.toString());
          await callback(content);

          channel.ack(msg);
          
        } catch (error) {
          console.error(`Error processing message from ${queueName}:`, error.message);
          
          channel.nack(msg, false, false);
        }
      }
    });
  }

  async failedConsumer(queueName, callback, prefetchCount = 5) {
    const channel = getChannel();
    channel.prefetch(prefetchCount);

    console.log(`[*] Waiting failed messages in queue: ${queueName} (Prefetch: ${prefetchCount})`);

    return channel.consume(queueName, async (msg) => {
      if (msg === null) return;

      try {
        const content = JSON.parse(msg.content.toString());
        await callback(content);
        channel.ack(msg);
      } catch (error) {
        console.error(`Error processing message from ${queueName}:`, error.message);
        channel.nack(msg, false, false);
      }
    });
  }
}

module.exports = new RabbitMQManager();