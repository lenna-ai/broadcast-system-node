/**
 * Capacity planning helpers for high-volume broadcast (10k–100k+).
 */

const parseIntEnv = (key, fallback) => {
    const value = parseInt(process.env[key], 10);
    return Number.isFinite(value) ? value : fallback;
};

const getWorkerCounts = () => ({
    queue: parseIntEnv('PM2_QUEUE_INSTANCES', 2),
    adira: parseIntEnv('PM2_ADIRA_QUEUE_INSTANCES', parseIntEnv('PM2_QUEUE_INSTANCES', 2)),
    failed: parseIntEnv('PM2_FAILED_QUEUE_INSTANCES', 1),
    fixed: 2, // server + scheduler
});

const getPoolMax = () => parseIntEnv('DB_POOL_MAX', 5);

const getTotalDbConnections = () => {
    const workers = getWorkerCounts();
    const processes = workers.queue + workers.adira + workers.failed + workers.fixed;
    return processes * getPoolMax();
};

const getEstimatedThroughputPerSecond = () => {
    const workers = getWorkerCounts();
    const poolMax = getPoolMax();
    const throttleMs = parseIntEnv('BROADCAST_THROTTLE_MS', 50);
    const apiLatencyMs = parseIntEnv('BROADCAST_AVG_API_MS', 200);

    const activeWorkers = workers.queue + workers.adira;
    const concurrencyPerProcess = poolMax;
    const cycleMs = throttleMs + apiLatencyMs;

    return Math.max(1, Math.floor((activeWorkers * concurrencyPerProcess * 1000) / cycleMs));
};

const validateCapacityConfig = () => {
    const warnings = [];
    const poolMax = getPoolMax();
    const prefetch = parseIntEnv('RABBITMQ_PREFETCH', poolMax);
    const failedPrefetch = parseIntEnv('RABBITMQ_FAILED_PREFETCH', 3);
    const chunkSize = parseIntEnv('SCHEDULER_CHUNK_SIZE', 25);
    const maxBatch = parseIntEnv('MAX_QUEUE_BATCH_SIZE', 25);
    const totalDb = getTotalDbConnections();
    const dbBudget = parseIntEnv('DB_MAX_CONNECTIONS_BUDGET', 80);

    if (prefetch > poolMax) {
        warnings.push(`RABBITMQ_PREFETCH (${prefetch}) > DB_POOL_MAX (${poolMax}) — risk pool exhaustion`);
    }

    if (failedPrefetch > poolMax) {
        warnings.push(`RABBITMQ_FAILED_PREFETCH (${failedPrefetch}) > DB_POOL_MAX (${poolMax})`);
    }

    if (chunkSize > maxBatch) {
        warnings.push(`SCHEDULER_CHUNK_SIZE (${chunkSize}) > MAX_QUEUE_BATCH_SIZE (${maxBatch}) — large RabbitMQ payloads`);
    }

    if (totalDb > dbBudget) {
        warnings.push(`Estimated DB connections (${totalDb}) exceeds DB_MAX_CONNECTIONS_BUDGET (${dbBudget})`);
    }

    return {
        warnings,
        stats: {
            totalDbConnections: totalDb,
            estimatedMsgPerSecond: getEstimatedThroughputPerSecond(),
            workerCounts: getWorkerCounts(),
            poolMax,
            prefetch,
            chunkSize,
        },
    };
};

const logCapacityReport = (label = 'worker') => {
    const { warnings, stats } = validateCapacityConfig();

    console.log(
        `[capacity:${label}] processes=${JSON.stringify(stats.workerCounts)} ` +
        `db_connections≈${stats.totalDbConnections} ` +
        `throughput≈${stats.estimatedMsgPerSecond} msg/s`
    );

    warnings.forEach((warning) => console.warn(`[capacity:${label}] WARN: ${warning}`));
};

module.exports = {
    getWorkerCounts,
    getTotalDbConnections,
    getEstimatedThroughputPerSecond,
    validateCapacityConfig,
    logCapacityReport,
};
