const express = require('express');
const router = express.Router();
const BroadcastController = require('./broadcast_controller');
const MonitoringController = require('./monitoring_controller');

router.post('/broadcast/publish', BroadcastController.publish);
router.post('/broadcast/listen', BroadcastController.listen);

// Monitoring & Stress Test Routes
router.get('/monitor/metrics', MonitoringController.getSystemMetrics);
router.get('/monitor/stress-db', MonitoringController.stressDb);

module.exports = router;