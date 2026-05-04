const rabbitMQManager = require('./queue/rabbitmq.manager');
const config = require('./config/rabbitmq');

async function sendTestMessages() {
  try {
    await rabbitMQManager.connect();

    // Send WhatsApp Message
    await rabbitMQManager.sendToQueue(config.queues.whatsapp, {
      to: '628123456789',
      message: 'Halo! Ini pesan siaran dari WhatsApp.'
    });

    // Send Email Message
    await rabbitMQManager.sendToQueue(config.queues.email, {
      email: 'test@example.com',
      subject: 'Broadcast Email',
      body: 'Ini isi email broadcast.'
    });

    // Send Lead Data
    await rabbitMQManager.sendToQueue(config.queues.lead, {
      name: 'John Doe',
      email: 'john@example.com',
      source: 'Website'
    });

    console.log('Semua pesan test telah dikirim ke queue');
    process.exit(0);
  } catch (error) {
    console.error('Error sending test messages:', error.message);
    process.exit(1);
  }
}

sendTestMessages();
