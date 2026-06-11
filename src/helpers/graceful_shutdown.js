let isShuttingDown = false;

const registerGracefulShutdown = (cleanup) => {
    const shutdown = async (signal) => {
        if (isShuttingDown) return;
        isShuttingDown = true;

        console.log(`Received ${signal}, shutting down gracefully...`);

        try {
            await cleanup();
        } catch (error) {
            console.error('Graceful shutdown error:', error.message);
            process.exit(1);
        }

        process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
};

module.exports = {
    registerGracefulShutdown,
    isShuttingDown: () => isShuttingDown,
};
