require('dotenv').config();
const knex = require('knex');
const { setTimeout: sleep } = require('timers/promises');

const parsePoolInt = (key, fallback) => {
    const value = parseInt(process.env[key], 10);
    return Number.isFinite(value) && value >= 0 ? value : fallback;
};

const requestedMin = parsePoolInt('DB_POOL_MIN', 1);
const requestedMax = Math.max(1, parsePoolInt('DB_POOL_MAX', 5));
const poolMin = Math.min(requestedMin, requestedMax);

const poolConfig = {
    min: poolMin,
    max: requestedMax,
    acquireTimeoutMillis: parsePoolInt('DB_POOL_ACQUIRE_TIMEOUT', 30000),
    idleTimeoutMillis: parsePoolInt('DB_POOL_IDLE_TIMEOUT', 120000),
    createTimeoutMillis: parsePoolInt('DB_POOL_CREATE_TIMEOUT', 30000),
    reapIntervalMillis: parsePoolInt('DB_POOL_REAP_INTERVAL', 1000),
    createRetryIntervalMillis: 200,
    propagateCreateError: true,
};

const db = knex({
    client: 'pg',
    acquireConnectionTimeout: parsePoolInt('DB_POOL_ACQUIRE_TIMEOUT', 30000),
    connection: {
        host: process.env.DB_HOST || '127.0.0.1',
        port: process.env.DB_PORT || 5432,
        user: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_DATABASE,
        keepAlive: true,
        keepAliveInitialDelayMillis: parsePoolInt('DB_KEEPALIVE_INITIAL_DELAY_MS', 10000),
        connectionTimeoutMillis: parsePoolInt('DB_CONNECT_TIMEOUT', 10000),
    },
    pool: poolConfig,
});

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

const formatPoolStats = (stats = getPoolStats()) =>
    `pool used=${stats.used} free=${stats.free} ` +
    `pending_acquires=${stats.pending_acquires} pending_creates=${stats.pending_creates} ` +
    `max=${stats.max} min=${stats.min}`;

const connectWithRetry = async () => {
    const attempts = parsePoolInt('DB_CONNECT_RETRIES', 20);
    const delayMs = parsePoolInt('DB_CONNECT_RETRY_DELAY_MS', 3000);

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            await db.raw('SELECT 1');
            console.log('📦 DB Connected');
            return;
        } catch (err) {
            console.error(
                `Failed to connect to database (attempt ${attempt}/${attempts}):`,
                err.message,
                formatPoolStats()
            );
            if (attempt === attempts) {
                process.exit(1);
            }
            await sleep(delayMs);
        }
    }
};

const whenReady = process.env.NODE_ENV === 'test'
    ? Promise.resolve()
    : connectWithRetry();

const destroyDb = () => db.destroy();

db.poolConfig = poolConfig;
db.getPoolStats = getPoolStats;
db.formatPoolStats = formatPoolStats;
db.whenReady = () => whenReady;
db.destroyDb = destroyDb;
module.exports = db;
