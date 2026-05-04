const db = require('../config/database');

const getExternalApi = async (filter, trx = db) => {
    return await trx('omnichannel.external_apis')
        .where(filter)
        .first();
};
const getExternalApiWithEndpoints = async (filter, endpointFilter, trx = db) => {
    const api = await trx('omnichannel.external_apis')
        .where(filter)
        .first();

    if (!api) return null;

    return await trx('omnichannel.external_api_endpoints')
        .where({ external_api_id: api.id, ...endpointFilter }).first();
    
};

module.exports = {
    getExternalApi,
    getExternalApiWithEndpoints
};