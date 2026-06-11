const queueInstances = parseInt(process.env.PM2_QUEUE_INSTANCES, 10) || 2;
const failedQueueInstances = parseInt(process.env.PM2_FAILED_QUEUE_INSTANCES, 10) || 1;

const baseAppConfig = {
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    kill_timeout: 10000,
    listen_timeout: 10000,
    env_local: {
        NODE_ENV: 'local',
        DOTENV_CONFIG_PATH: './.env',
    },
    env_production: {
        NODE_ENV: 'production',
        DOTENV_CONFIG_PATH: './.env',
    },
};

module.exports = {
    apps: [
        {
            name: 'broadcast|queue',
            script: './src/workers/broadcast_worker.js',
            instances: queueInstances,
            exec_mode: 'cluster',
            ...baseAppConfig,
        },
        {
            name: 'broadcast|failed-queue',
            script: './src/workers/failed_worker.js',
            instances: failedQueueInstances,
            exec_mode: 'cluster',
            ...baseAppConfig,
        },
        {
            name: 'broadcast|monitor',
            script: './src/workers/monitor_worker.js',
            instances: 1,
            exec_mode: 'fork',
            autorestart: true,
            watch: false,
            env: {
                NODE_ENV: 'development',
            },
            env_production: {
                NODE_ENV: 'production',
            },
        },
        {
            name: 'broadcast|server',
            script: './server.js',
            instances: 1,
            exec_mode: 'fork',
            ...baseAppConfig,
        },
        {
            name: 'broadcast|scheduler',
            script: './src/scheduler.js',
            instances: 1,
            exec_mode: 'fork',
            ...baseAppConfig,
        },
    ],
};
