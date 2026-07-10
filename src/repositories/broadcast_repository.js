const got = require('got').default || require('got');
const { DateTime } = require('luxon');
const db = require('../config/database');
const CONSTANTS = require('../config/constants');

const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Jakarta';
const nowInTimezone = () => DateTime.now().setZone(APP_TIMEZONE).toFormat('yyyy-MM-dd HH:mm:ss');

const sendBroadcast = async (method, endpoint, options) => {
    try {
        const httpMethod = (method || 'post').toLowerCase();
        const response = await got(endpoint, {
            ...options,
            method: httpMethod.toUpperCase(),
            responseType: 'json',
        });

        if (process.env.NODE_ENV !== 'production') {
            console.log('Broadcast sent:', response.body);
        }
        return response.body;
    } catch (error) {
        console.error("Failed to send broadcast:", error.response?.body || error.message);
        throw error;
    }
};

const saveBroadcastMessage = async (request, resData, payload, trx = null) => {
    const { ID: channelId, CLIENT: client } = CONSTANTS.CHANNEL.WHATSAPP;

    const insertData = {
        channel_id: channelId,
        channel_data: request.channel_data || null,
        type: 'broadcast',
        category: 'hsm',
        client,
        topics: request.template.template_name,
        app_id: request.app_id,
        integration_id: request.integration_id,
        status: resData.status,
        number: resData.to,
        data: JSON.stringify(resData),
        body: JSON.stringify(payload),
        channel_message_id: resData.msgId,
        send_by: request.sent_by,
        schedule_at: request.schedule_at || nowInTimezone(),
        created_at: nowInTimezone(),
        updated_at: nowInTimezone(),
        broadcast_id: request.broadcast_id || null,
    };

    if (trx) {
        await trx('omnichannel.broadcast_messages').insert(insertData);
        return resData;
    }

    return db.transaction(async (transaction) => {
        await transaction('omnichannel.broadcast_messages').insert(insertData);
        return resData;
    });
};

module.exports = {
    sendBroadcast,
    saveBroadcastMessage,
};
