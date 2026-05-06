require('dotenv').config();
const express = require('express');
const routes = require('./src/api/routes');
const { connectRabbitMQ } = require('./src/config/rabbitmq');

const app = express();

app.use(express.json()); // Biar bisa baca JSON body
app.use('/api', routes); // Daftarin semua route

const PORT = process.env.PORT || 3000;

const startServer = async () => {
    try {
        // Inisialisasi RabbitMQ sebelum server jalan
        await connectRabbitMQ();
        
        app.listen(PORT, () => {
            console.log(`🚀 API Server running on port ${PORT}`);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error.message);
        process.exit(1);
    }
};

startServer();