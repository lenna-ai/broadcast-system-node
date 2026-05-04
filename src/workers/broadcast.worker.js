const rabbitMQManager = require('../queue/rabbitmq.manager');
const config = require('../config/rabbitmq');
const ServiceFactory = require('../services/service.factory');

class BroadcastWorker {
  async start() {
    try {
      await rabbitMQManager.connect();

      // Listen to WhatsApp Queue
      await rabbitMQManager.consume(config.queues.WHATSAPP, async (data) => {
        const service = ServiceFactory.getService('whatsapp');
        await service.send(data);
      });

      // Listen to Email Queue
      await rabbitMQManager.consume(config.queues.EMAIL, async (data) => {
        const service = ServiceFactory.getService('email');
        await service.send(data);
      });

      // Listen to Lead Queue
      await rabbitMQManager.consume(config.queues.LEADS, async (data) => {
        const service = ServiceFactory.getService('lead');
        await service.process(data);
      });

      console.log('Broadcast Worker is running...');
    } catch (error) {
      console.error('Failed to start worker:', error.message);
      process.exit(1);
    }
  }
}

module.exports = new BroadcastWorker();
