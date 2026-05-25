const db = require('../config/database');
const { getPoolStats } = require('../config/database');
const { successResponse, errorResponse } = require('../helpers/response');
const os = require('os');

const getSystemMetrics = async (req, res) => {
    try {
        // DB Metrics
        const dbStatus = getPoolStats();

        // CPU & Memory Metrics
        const memoryUsage = process.memoryUsage();
        const cpuLoad = os.loadavg();
        
        const metrics = {
            database: dbStatus,
            system: {
                cpu_load_1m: cpuLoad[0],
                memory: {
                    rss: `${Math.round(memoryUsage.rss / 1024 / 1024 * 100) / 100} MB`,
                    heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024 * 100) / 100} MB`,
                    heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024 * 100) / 100} MB`
                },
                uptime: `${Math.round(process.uptime())}s`
            }
        };

        return successResponse(res, 'Metrics retrieved successfully', metrics);
    } catch (error) {
        return errorResponse(res, error.message, null, 500);
    }
};

const stressDb = async (req, res) => {
    try {
        const count = req.query.count || 10;
        const promises = [];
        
        for (let i = 0; i < count; i++) {
            promises.push(db.raw('SELECT 1 + 1 as result'));
        }
        
        const startTime = Date.now();
        await Promise.all(promises);
        const duration = Date.now() - startTime;

        return successResponse(res, `Executed ${count} parallel DB queries`, {
            duration_ms: duration,
            queries_per_second: Math.round((count / (duration / 1000)) * 100) / 100
        });
    } catch (error) {
        return errorResponse(res, error.message, null, 500);
    }
};

module.exports = { getSystemMetrics, stressDb };
