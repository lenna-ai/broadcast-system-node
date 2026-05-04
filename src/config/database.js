require('dotenv').config();
const knex = require('knex');
const db = knex({
    client: 'pg',
    connection: {
        host: process.env.DB_HOST || '127.0.0.1',
        port: process.env.DB_PORT || 5432,
        user: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_DATABASE,
    },
    pool: { min: 2, max: 10 }
});

db.raw('SELECT 1')
    .then(() => {
        console.log('📦 DB Connected');
    })
    .catch((err) => {
        console.log(process.env.DB_HOST, process.env.DB_PORT, process.env.DB_USERNAME, process.env.DB_PASSWORD, process.env.DB_DATABASE);
        console.error('Failed to connect to database:', err.message);
        process.exit(1); 
    });

module.exports = db;