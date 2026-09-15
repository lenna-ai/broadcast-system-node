jest.mock('got', () => {
    const mockGot = jest.fn();
    mockGot.default = mockGot;
    return mockGot;
});

jest.mock('../src/config/database', () => ({}));

const { mergeBroadcastMessageData } = require('../src/repositories/broadcast_repository');

describe('mergeBroadcastMessageData', () => {
    test('merges channel_data into resData for broadcast_messages.data', () => {
        const merged = mergeBroadcastMessageData(
            { to: '6282213923127', status: 'sent', msgId: 'wamid.1' },
            {
                sales_force_id: '003Q800001YsIezIAF',
                campaign_code: 'completion_mar2026',
                brand: 'Frisian Flag',
            }
        );

        expect(merged).toEqual({
            sales_force_id: '003Q800001YsIezIAF',
            campaign_code: 'completion_mar2026',
            brand: 'Frisian Flag',
            to: '6282213923127',
            status: 'sent',
            msgId: 'wamid.1',
        });
    });

    test('parses channel_data JSON string', () => {
        const merged = mergeBroadcastMessageData(
            { status: 'sent' },
            JSON.stringify({ sales_force_id: '003xx' })
        );
        expect(merged.sales_force_id).toBe('003xx');
        expect(merged.status).toBe('sent');
    });

    test('keeps resData when channel_data is empty', () => {
        const resData = { status: 'failed', to: '6281' };
        expect(mergeBroadcastMessageData(resData, null)).toEqual(resData);
    });
});
