module.exports = {
    RABBITMQ: {
        EXCHANGES: {
            DLX: 'broadcast_failed_exchange',
        },
        ROUTING_KEYS: {
            FAILED: 'whatsapp_failed_route'
        },
        QUEUES: {
            WHATSAPP: 'whatsapp_hsm_queue_v5',
            EMAIL: 'email_queue_v5',
            EMAIL_HSM: 'email_hsm_queue_v5',
            LEADS: 'leads_queue_v5',
            FAILED: 'broadcast_failed_queue'
        }
    }
};