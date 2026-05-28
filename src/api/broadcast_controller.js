const BroadcastManager = require('../services/broadcast_manager');
const { successResponse, errorResponse } = require('../helpers/response');


const publish = async (req, res) => {
    // Oper ke logic murni yg udah kita buat sebelumnya
    const response = await BroadcastManager.publish(req.body);
    
    // Set HTTP status code
    let statusCode = 200;
    if (response.status === 'error') statusCode = 500;
    if (response.status === 'partial_success') statusCode = 207;

    return res.status(statusCode).json(response);
};

const listen = async (req, res) => {
    try {
        const response = await BroadcastManager.listen(req.body);

        return successResponse(res, 'The message was successfully processed', response);
    } catch (error) {
        return errorResponse(res, error.message, error.errors, 500);
    }
};

module.exports = { publish, listen };