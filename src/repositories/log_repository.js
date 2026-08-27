const db = require('../config/database');
const DateTime = require('luxon').DateTime;
const { isKnexTransaction, withDbRetry } = require('../helpers/db_retry');

const insertApiLog = async (data, trx = null) => {
    const row = {
        ...data,
        user_id: 1,
        created_at: DateTime.now().toFormat('yyyy-MM-dd HH:mm:ss'),
        updated_at: DateTime.now().toFormat('yyyy-MM-dd HH:mm:ss'),
    };

    if (isKnexTransaction(trx)) {
        return trx('omnichannel.api_logs').insert(row);
    }

    return withDbRetry(() => db('omnichannel.api_logs').insert(row));
};

module.exports = {
    insertApiLog,
};
