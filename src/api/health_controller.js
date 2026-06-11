const { successResponse } = require('../helpers/response');

const health = async (_req, res) => {
    return successResponse(res, 'OK', {
        status: 'healthy',
        uptime: Math.round(process.uptime()),
        env: process.env.NODE_ENV || 'development',
    });
};

module.exports = { health };
