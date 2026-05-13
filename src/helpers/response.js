
const successResponse = (res, message, data = null, statusCode = 200) => {
    return res.status(statusCode).json({
        success: true,
        message: message,
        data: data,
        meta: { timestamp: new Date().toISOString() }
    });
};

const errorResponse = (res, message, errors = null, statusCode = 400) => {
    return res.status(statusCode).json({
        success: false,
        message: message,
        errors: errors,
        meta: { timestamp: new Date().toISOString() }
    });
};

module.exports = { successResponse, errorResponse };