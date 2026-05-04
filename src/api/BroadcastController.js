const BroadcastManager = require('../services/BroadcastManager');

const publish = async (req, res) => {
    // Oper ke logic murni yg udah kita buat sebelumnya
    const result = await BroadcastManager.publish(req.body);
    
    // Set HTTP status code
    let statusCode = 200;
    if (result.status === 'error') statusCode = 500;
    if (result.status === 'partial_success') statusCode = 207;

    return res.status(statusCode).json(result);
};

const listen = async (req, res) => {
    const result = await BroadcastManager.listen(req.body);
    
    return res.json(result);
};

module.exports = { publish, listen };