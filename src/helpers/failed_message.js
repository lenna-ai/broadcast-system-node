/**
 * Normalizes payloads from broadcast_failed_queue.
 * Supports: wrapped failed items, broadcast batches (DLX), or single broadcast payloads.
 */
function isFailedWrapper(item) {
    return (
        item &&
        typeof item === 'object' &&
        Object.prototype.hasOwnProperty.call(item, 'error_reason') &&
        Object.prototype.hasOwnProperty.call(item, 'failed_at') &&
        Object.prototype.hasOwnProperty.call(item, 'data')
    );
}

function toFailedItem(broadcastPayload, errorReason, failedAt) {
    return {
        data: broadcastPayload,
        error_reason: errorReason || 'Processing failed',
        failed_at: failedAt || new Date().toISOString(),
    };
}

function normalizeFailedQueuePayload(content) {
    if (content == null) return [];

    if (Array.isArray(content)) {
        if (content.length === 0) return [];
        if (isFailedWrapper(content[0])) {
            return content;
        }
        return content.map((item) =>
            toFailedItem(item, 'Dead lettered or batch failure')
        );
    }

    if (isFailedWrapper(content)) {
        return [content];
    }

    return [toFailedItem(content, 'Dead lettered from queue')];
}

function normalizeWhatsappQueuePayload(content) {
    if (Array.isArray(content)) return content;
    return [content];
}

module.exports = {
    normalizeFailedQueuePayload,
    normalizeWhatsappQueuePayload,
    isFailedWrapper,
};
