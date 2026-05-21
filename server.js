require('dotenv').config();
const app = require('./app');
const { connectRabbitMQ } = require('./src/config/rabbitmq');

const PORT = process.env.PORT || 3000;

const startServer = async () => {
    try {
        // Inisialisasi RabbitMQ sebelum server jalan
        await connectRabbitMQ();
        
        app.listen(PORT, () => {
            console.log(`Listerner running on port ${PORT}`);
        });
    } catch (error) {
        console.error('Failed to start listerners:', error.message);
        process.exit(1);
    }
};

startServer();
