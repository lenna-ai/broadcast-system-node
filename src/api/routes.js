const express = require('express');
const router = express.Router();
const BroadcastController = require('./broadcast_controller');
const MonitoringController = require('./monitoring_controller');
const HealthController = require('./health_controller');

router.get('/health', HealthController.health);
router.post('/broadcast/publish', BroadcastController.publish);
router.post('/broadcast/listen', BroadcastController.listen);
router.get('/monitor/metrics', MonitoringController.getSystemMetrics);

if (process.env.ENABLE_STRESS_ENDPOINT === 'true') {
    router.get('/monitor/stress-db', MonitoringController.stressDb);
}

module.exports = router;