const db = require('../config/database');
const DateTime = require('luxon').DateTime;

const insertApiLog = async (data, trx = db) => {
    data.user_id = 1;
    data.created_at = DateTime.now().toFormat('yyyy-MM-dd HH:mm:ss');
    data.updated_at = DateTime.now().toFormat('yyyy-MM-dd HH:mm:ss');

    return await trx('omnichannel.api_logs')
        .insert(data);
}

module.exports = {
    insertApiLog
}