const express = require('express');
const routes = require('./src/api/routes');

const app = express();
const jsonLimit = process.env.JSON_BODY_LIMIT || '1mb';

app.use(express.json({ limit: jsonLimit }));
app.use('/api', routes);

module.exports = app;
