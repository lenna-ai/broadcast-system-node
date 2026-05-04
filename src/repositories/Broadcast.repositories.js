import got from 'got';
import { DateTime } from 'luxon';
import db from '../config/database.js';

export const sendBroadcast = async (method, endpoint, options) => {
    try {
        method = method.toLowerCase();
        const response = await got[method](endpoint, {
            ...options,
            responseType: 'json'
        });

        console.log("Broadcast sent:", response.body);
        return response.body;
    } catch (error) {
        console.error("Failed to send broadcast:", error.response?.body || error.message);
        throw error; 
    }
};

export const saveBroadcastMessage = async (request, integration, resData, payload) => {
    const trx = await db.transaction();
    const insertData = {
        channel_id: 4,
        type: 'broadcast',
        category: 'hsm',
        client: 'whatsapp',
        topics: request.template.template_name,
        app_id: integration.app_id,
        integration_id: integration.id,
        status: resData.status,
        number: resData.to,
        data: JSON.stringify(resData),
        body: JSON.stringify(payload),
        channel_message_id: resData.msgId,
        send_by: request.sent_by,
        schedule_at: request.schedule_at || DateTime.now().toFormat('yyyy-MM-dd HH:mm:ss'),
        created_at: DateTime.now().toFormat('yyyy-MM-dd HH:mm:ss'),
        updated_at: DateTime.now().toFormat('yyyy-MM-dd HH:mm:ss'),
        broadcast_id: request.broadcast_id || null
    };  
    await trx('omnichannel.broadcast_messages').insert(insertData);
    await trx.commit();
    return resData;
};