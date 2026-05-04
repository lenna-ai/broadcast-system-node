const { connectRabbitMQ, getChannel, url, queues } = require('../config/rabbitmq');

class RabbitMQManager {
  async connect() {
    return connectRabbitMQ();
  }

  async sendToQueue(queueName, message) {
    const channel = getChannel();
    
    return channel.sendToQueue(
      queueName,
      Buffer.from(JSON.stringify(message)),
      { persistent: true }
    );
  }

  async consume(queueName, callback) {
    const channel = getChannel();

    console.log(`[*] Menunggu pesan di queue: ${queueName}`);
    
    return channel.consume(queueName, async (msg) => {
      if (msg !== null) {
        const content = JSON.parse(msg.content.toString());
        try {
          await callback(content);
          channel.ack(msg);
        } catch (error) {
          console.error(`Error processing message from ${queueName}:`, error.message);
          // Requeue message if error
          channel.nack(msg);
        }
      }
    });
  }
}

module.exports = new RabbitMQManager();
