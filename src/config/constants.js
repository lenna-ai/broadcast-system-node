module.exports = {
    CHANNEL: {
        WHATSAPP: {
            ID: parseInt(process.env.WHATSAPP_CHANNEL_ID, 10) || 4,
            CLIENT: 'whatsapp',
        },
    },
    FORWARD: {
        SALESFORCE_APP_ID: parseInt(process.env.SALESFORCE_APP_ID, 10) || 618,
        SALESFORCE_TOKEN_CACHE_KEY: process.env.SALESFORCE_TOKEN_CACHE_KEY || 'ff-access-token',
        SALESFORCE_TOKEN_CACHE_TTL_HOURS: parseInt(process.env.SALESFORCE_TOKEN_CACHE_TTL_HOURS, 10) || 12,
    },
    RABBITMQ: {
        EXCHANGES: {
            DLX: 'broadcast_failed_exchange',
        },
        ROUTING_KEYS: {
            FAILED: 'broadcast_failed_routing_key'
        },
        QUEUES: {
            WHATSAPP: 'broadcast_whatsapp_hsm_queue',
            WHATSAPP_ADIRA: 'broadcast_whatsapp_hsm_adira',
            FAILED_QUEUE: 'broadcast_failed_queue',
            // EMAIL: 'email_queue_v5',
            // EMAIL_HSM: 'email_hsm_queue_v5',
            // LEADS: 'leads_queue_v5',
            // FAILED_ROUTING_KEY: 'whatsapp_failed_route',
            // FAILED_EXCHANGE: 'broadcast_failed_exchange',
        }
    }
};