const express = require('express');
const router = express.Router();
const BroadcastController = require('./BroadcastController');

router.post('/broadcast/publish', BroadcastController.publish);
router.post('/broadcast/listen', BroadcastController.listen);

module.exports = router;