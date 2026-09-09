require('dotenv').config();
const app = require('./app');
const db = require('./src/config/database');
const { connectRabbitMQ, closeRabbitMQ } = require('./src/config/rabbitmq');
const { closeRedis } = require('./src/config/redis');
const { registerGracefulShutdown } = require('./src/helpers/graceful_shutdown');

const PORT = process.env.PORT || 3000;
let server;

const startServer = async () => {
    try {
        await db.whenReady();
        await connectRabbitMQ();

        server = app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });

        registerGracefulShutdown(async () => {
            if (server) {
                await new Promise((resolve) => server.close(resolve));
            }
            await closeRabbitMQ();
            await closeRedis();
            await db.destroyDb();
        });
    } catch (error) {
        console.error('Failed to start server:', error.message);
        process.exit(1);
    }
};

startServer();
