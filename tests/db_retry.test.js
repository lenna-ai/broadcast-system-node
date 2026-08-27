const { isTransientDbError, withDbRetry, isKnexTransaction } = require('../src/helpers/db_retry');

describe('db_retry helpers', () => {
    test('detects knex connection-ended errors', () => {
        expect(isTransientDbError(new Error('Connection ended unexpectedly'))).toBe(true);
        expect(isTransientDbError(new Error('Connection terminated unexpectedly'))).toBe(true);
        expect(isTransientDbError(new Error('the database system is starting up'))).toBe(true);
        expect(isTransientDbError(new Error('Integration not found'))).toBe(false);
    });

    test('retries transient errors then succeeds', async () => {
        let attempts = 0;
        const result = await withDbRetry(async () => {
            attempts += 1;
            if (attempts < 3) {
                throw new Error('Connection ended unexpectedly');
            }
            return 'ok';
        }, { delayMs: 1 });

        expect(result).toBe('ok');
        expect(attempts).toBe(3);
    });

    test('does not retry business errors', async () => {
        await expect(
            withDbRetry(async () => {
                throw new Error('Integration not found');
            }, { delayMs: 1 })
        ).rejects.toThrow('Integration not found');
    });

    test('isKnexTransaction only accepts knex transactions', () => {
        expect(isKnexTransaction(null)).toBe(false);
        expect(isKnexTransaction({})).toBe(false);
        expect(isKnexTransaction({ isTransaction: true })).toBe(true);
    });
});
