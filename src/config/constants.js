module.exports = {
    RABBITMQ: {
        EXCHANGES: {
            DLX: 'broadcast_failed_exchange',
        },
        ROUTING_KEYS: {
            FAILED: 'broadcast_failed_routing_key'
        },
        QUEUES: {
            WHATSAPP: 'broadcast_whatsapp_hsm_queue',
            FAILED_QUEUE: 'broadcast_failed_queue',
            // EMAIL: 'email_queue_v5',
            // EMAIL_HSM: 'email_hsm_queue_v5',
            // LEADS: 'leads_queue_v5',
            // FAILED_ROUTING_KEY: 'whatsapp_failed_route',
            // FAILED_EXCHANGE: 'broadcast_failed_exchange',
        }
    }
};