const {
    getTotalDbConnections,
    getEstimatedThroughputPerSecond,
    validateCapacityConfig,
    capToPool,
} = require('../src/helpers/capacity');

describe('capacity helpers', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        process.env = { ...originalEnv };
        process.env.PM2_QUEUE_INSTANCES = '2';
        process.env.PM2_ADIRA_QUEUE_INSTANCES = '2';
        process.env.PM2_FAILED_QUEUE_INSTANCES = '1';
        process.env.DB_POOL_MAX = '5';
        process.env.RABBITMQ_PREFETCH = '5';
        process.env.BROADCAST_THROTTLE_MS = '50';
        process.env.BROADCAST_AVG_API_MS = '200';
        process.env.DB_MAX_CONNECTIONS_BUDGET = '40';
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    test('calculates total DB connections', () => {
        expect(getTotalDbConnections()).toBe(35);
    });

    test('warns when prefetch exceeds pool max', () => {
        process.env.RABBITMQ_PREFETCH = '10';
        const { warnings } = validateCapacityConfig();
        expect(warnings.some((w) => w.includes('RABBITMQ_PREFETCH'))).toBe(true);
    });

    test('estimates throughput above zero', () => {
        expect(getEstimatedThroughputPerSecond()).toBeGreaterThan(0);
    });

    test('caps prefetch to pool max', () => {
        expect(capToPool(10, 5)).toBe(5);
        expect(capToPool(3, 5)).toBe(3);
        expect(capToPool('invalid', 5)).toBe(5);
    });

    test('warns when estimated connections exceed budget', () => {
        process.env.DB_POOL_MAX = '10';
        const { warnings } = validateCapacityConfig();
        expect(warnings.some((w) => w.includes('DB_MAX_CONNECTIONS_BUDGET'))).toBe(true);
    });
});
