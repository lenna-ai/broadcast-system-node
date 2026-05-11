const BroadcastManager = require('../services/BroadcastManager');
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
    const response = await BroadcastManager.listen(req.body);

    return successResponse(response, 'The message was successfully processed');
};

module.exports = { publish, listen };