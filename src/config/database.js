require('dotenv').config();
const knex = require('knex');

const poolConfig = {
    min: parseInt(process.env.DB_POOL_MIN, 10) || 2,
    max: parseInt(process.env.DB_POOL_MAX, 10) || 5,
    acquireTimeoutMillis: parseInt(process.env.DB_POOL_ACQUIRE_TIMEOUT, 10) || 30000,
    idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT, 10) || 30000,
    createTimeoutMillis: parseInt(process.env.DB_POOL_CREATE_TIMEOUT, 10) || 30000,
    reapIntervalMillis: parseInt(process.env.DB_POOL_REAP_INTERVAL, 10) || 1000,
};

const db = knex({
    client: 'pg',
    connection: {
        host: process.env.DB_HOST || '127.0.0.1',
        port: process.env.DB_PORT || 5432,
        user: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_DATABASE,
    },
    pool: poolConfig,
});

if (process.env.NODE_ENV !== 'test') {
    db.raw('SELECT 1')
        .then(() => {
            console.log('📦 DB Connected');
        })
        .catch((err) => {
            console.error('Failed to connect to database:', err.message);
            process.exit(1);
        });
}

const getPoolStats = () => {
    const pool = db.client.pool;
    return {
        used: pool.numUsed(),
        free: pool.numFree(),
        pending_acquires: pool.numPendingAcquires(),
        pending_creates: pool.numPendingCreates(),
        total: pool.numUsed() + pool.numFree(),
        max: poolConfig.max,
        min: poolConfig.min,
    };
};

const destroyDb = () => db.destroy();

db.poolConfig = poolConfig;
db.getPoolStats = getPoolStats;
db.destroyDb = destroyDb;
module.exports = db;