const broadcastWorker = require('./workers/broadcast.worker');

console.log('Starting Broadcast System...');

broadcastWorker.start();
