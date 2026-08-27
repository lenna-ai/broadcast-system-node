const { setTimeout: sleep } = require('timers/promises');

const TRANSIENT_DB_ERROR = /ended unexpectedly|terminated unexpectedly|Connection terminated|ECONNRESET|ECONNREFUSED|the database system is starting up|not yet accepting connections|Client has encountered a connection error|Connection terminated due to connection timeout|too many clients already/i;

const parseRetryInt = (key, fallback) => {
    const value = parseInt(process.env[key], 10);
    return Number.isFinite(value) && value > 0 ? value : fallback;
};

const isKnexTransaction = (trx) => Boolean(trx && trx.isTransaction);

const isTransientDbError = (error) => {
    const message = error?.message || String(error || '');
    const code = error?.code || '';
    return TRANSIENT_DB_ERROR.test(message) || TRANSIENT_DB_ERROR.test(code);
};

const withDbRetry = async (fn, options = {}) => {
    const attempts = options.attempts || parseRetryInt('DB_QUERY_RETRIES', 3);
    const delayMs = options.delayMs || parseRetryInt('DB_QUERY_RETRY_DELAY_MS', 200);

    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            if (!isTransientDbError(error) || attempt === attempts) {
                throw error;
            }
            await sleep(delayMs * attempt);
        }
    }
    throw lastError;
};

module.exports = {
    isKnexTransaction,
    isTransientDbError,
    withDbRetry,
};
