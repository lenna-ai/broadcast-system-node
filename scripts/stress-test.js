const autocannon = require('autocannon');

const url = process.argv[2] || 'http://localhost:3000';

function runStressTest() {
    console.log(`Starting stress test on ${url}...`);

    const instance = autocannon({
        url: url,
        connections: 100, // Concurrent connections
        duration: 30,    // Duration in seconds
        pipelining: 1,
        requests: [
            {
                method: 'POST',
                path: '/api/broadcast/publish',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    type: 'whatsapp',
                    payload: {
                        message: 'Stress test message',
                        to: '628123456789'
                    }
                })
            },
            {
                method: 'GET',
                path: '/api/monitor/metrics'
            }
        ]
    }, (err, result) => {
        if (err) {
            console.error('Error running stress test:', err);
        } else {
            console.log('Stress test completed!');
            console.log('-------------------------');
            console.log(`Total Requests: ${result['2xx'] + result['4xx'] + result['5xx']}`);
            console.log(`Requests/sec: ${result.requests.average}`);
            console.log(`Latency (ms): Avg: ${result.latency.average}, Max: ${result.latency.max}`);
            console.log(`Throughput: ${Math.round(result.throughput.average / 1024 / 1024 * 100) / 100} MB/sec`);
            console.log('-------------------------');
        }
    });

    // Track metrics during stress test
    autocannon.track(instance, { renderProgressBar: true });
}

runStressTest();
