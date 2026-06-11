const client = require('prom-client');

client.collectDefaultMetrics({ register: client.register });

const broadcastCounter = new client.Counter({
    name: 'whatsapp_broadcast_total',
    help: 'Total pesan whatsapp yang diproses',
    labelNames: ['status'],
});

module.exports = { broadcastCounter, register: client.register };
