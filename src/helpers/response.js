
const successResponse = (res, message, data = {}, statusCode = 200) => {
    return res.status(statusCode).json({
        success: true,
        message,
        data,
        meta: { timestamp: new Date().toISOString() }
    });
};

const errorResponse = (res, message, errors = null, statusCode = 400) => {
    const response = {
        success: false,
        message,
        meta: { timestamp: new Date().toISOString() }
    };

    if (errors) {
        response.errors = errors;
    }

    return res.status(statusCode).json(response);
};

module.exports = { successResponse, errorResponse };