const broadcastWorker = require('./workers/broadcast_worker');

console.log('Starting Broadcast System...');

broadcastWorker.start();
