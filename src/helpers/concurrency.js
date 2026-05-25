/**
 * Run async tasks with a fixed concurrency limit (aligned with DB pool size).
 */
async function runWithConcurrencyLimit(items, fn, limit) {
    if (!items.length) return [];

    const concurrency = Math.max(1, Math.min(limit, items.length));
    const results = new Array(items.length);
    let nextIndex = 0;

    const worker = async () => {
        while (nextIndex < items.length) {
            const currentIndex = nextIndex++;
            results[currentIndex] = await fn(items[currentIndex], currentIndex);
        }
    };

    await Promise.all(Array.from({ length: concurrency }, worker));
    return results;
}

module.exports = { runWithConcurrencyLimit };
