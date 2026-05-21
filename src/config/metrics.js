const client = require('prom-client');
const express = require('express');
const app = express();

// Mengumpulkan metrik bawaan Node.js (CPU, Memory, Garbage Collection)
const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics({ register: client.register });

// Buat metrik kustom untuk sistem broadcast kamu
const broadcastCounter = new client.Counter({
  name: 'whatsapp_broadcast_total',
  help: 'Total pesan whatsapp yang diproses',
  labelNames: ['status'] // 'success' atau 'failed'
});

// Jalankan server kecil khusus untuk metrik di port 9100
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

app.listen(3000, () => {
  console.log('Metrics server listening on port 9100');
});

module.exports = { broadcastCounter };