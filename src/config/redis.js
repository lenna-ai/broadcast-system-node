const Redis = require('ioredis');

let client = null;

const parseIntEnv = (key, fallback) => {
    const value = parseInt(process.env[key], 10);
    return Number.isFinite(value) && value >= 0 ? value : fallback;
};

const isConfigured = () => Boolean(process.env.REDIS_URL || process.env.REDIS_HOST);

const createClient = () => {
    const keyPrefix = process.env.REDIS_KEY_PREFIX || '';
    const options = {
        keyPrefix,
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableReadyCheck: true,
        retryStrategy: (times) => Math.min(times * 200, 2000),
    };

    if (process.env.REDIS_URL) {
        return new Redis(process.env.REDIS_URL, options);
    }

    const password = process.env.REDIS_PASSWORD || undefined;
    return new Redis({
        host: process.env.REDIS_HOST,
        port: parseIntEnv('REDIS_PORT', 6379),
        password: password || undefined,
        db: parseIntEnv('REDIS_DB', 0),
        ...options,
    });
};

const getRedis = () => {
    if (!isConfigured()) return null;
    if (client) return client;

    client = createClient();
    client.on('error', (error) => {
        console.error('Redis error:', error.message);
    });
    return client;
};

const connectRedis = async () => {
    if (!isConfigured()) return null;

    try {
        const redis = getRedis();
        if (!redis) return null;
        if (redis.status === 'wait') {
            await redis.connect();
        }
        return redis;
    } catch (error) {
        console.error('Redis connect failed:', error.message);
        return null;
    }
};

const cacheGet = async (key) => {
    const redis = await connectRedis();
    if (!redis) return null;
    try {
        return await redis.get(key);
    } catch (error) {
        console.error('Redis get failed:', error.message);
        return null;
    }
};

const cacheSet = async (key, value, ttlSeconds) => {
    const redis = await connectRedis();
    if (!redis) return false;
    try {
        if (ttlSeconds > 0) {
            await redis.set(key, value, 'EX', ttlSeconds);
        } else {
            await redis.set(key, value);
        }
        return true;
    } catch (error) {
        console.error('Redis set failed:', error.message);
        return false;
    }
};

const cacheDel = async (key) => {
    const redis = await connectRedis();
    if (!redis) return false;
    try {
        await redis.del(key);
        return true;
    } catch (error) {
        console.error('Redis del failed:', error.message);
        return false;
    }
};

const cacheTtl = async (key) => {
    const redis = await connectRedis();
    if (!redis) return -1;
    try {
        return await redis.ttl(key);
    } catch (error) {
        console.error('Redis ttl failed:', error.message);
        return -1;
    }
};

const closeRedis = async () => {
    if (!client) return;
    try {
        await client.quit();
    } catch (error) {
        console.error('Error closing Redis:', error.message);
        try {
            client.disconnect();
        } catch {
            // ignore
        }
    }
    client = null;
};

module.exports = {
    isConfigured,
    connectRedis,
    cacheGet,
    cacheSet,
    cacheDel,
    cacheTtl,
    closeRedis,
};
