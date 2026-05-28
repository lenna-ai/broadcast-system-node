const BroadcastManager = require('./src/services/broadcast_manager');

async function testValidation() {
    console.log('--- Testing Empty Payload ---');
    const res1 = await BroadcastManager.listen({});
    console.log('Result 1:', res1);

    console.log('\n--- Testing Missing Params ---');
    const res2 = await BroadcastManager.listen({ data: [] });
    console.log('Result 2:', res2);

    console.log('\n--- Testing Valid Payload ---');
    const res3 = await BroadcastManager.listen({ 
        params: { type: 'whatsapp', recipient: '628123' }, 
        data: [{ id: '123', status: 'delivered' }] 
    });
    console.log('Result 3:', res3);
}

testValidation();
