const { connectRabbitMQ, getChannelOrConnect, onReconnected } = require('../config/rabbitmq');

class RabbitMQManager {
    constructor() {
        this.consumers = [];
        this.reconnectBound = false;
    }

    async connect() {
        const channel = await connectRabbitMQ();
        if (!this.reconnectBound) {
            onReconnected(() => this.restoreConsumers());
            this.reconnectBound = true;
        }
        return channel;
    }

    async ensureChannel() {
        return getChannelOrConnect();
    }

    async publishToQueue(queueName, message) {
        const buffer = Buffer.from(JSON.stringify(message));

        const tryPublish = async () => {
            const channel = await this.ensureChannel();
            const send = () => channel.sendToQueue(queueName, buffer, { persistent: true });

            let published = send();

            if (!published) {
                await new Promise((resolve) => channel.once('drain', resolve));
                published = send();
            }

            if (!published) {
                throw new Error(`RabbitMQ buffer full, failed to publish to ${queueName}`);
            }

            return published;
        };

        try {
            return await tryPublish();
        } catch (error) {
            console.error(`RabbitMQ publish failed, retrying: ${error.message}`);
            await connectRabbitMQ();
            return tryPublish();
        }
    }

    async consumer(queueName, callback, prefetchCount = 20) {
        this.consumers.push({ type: 'consumer', queueName, callback, prefetchCount });
        return this.startConsumer(queueName, callback, prefetchCount, `[*] Waiting messages in queue: ${queueName} (Prefetch: ${prefetchCount})`);
    }

    async failedConsumer(queueName, callback, prefetchCount = 5) {
        this.consumers.push({ type: 'failed', queueName, callback, prefetchCount });
        return this.startConsumer(queueName, callback, prefetchCount, `[*] Waiting failed messages in queue: ${queueName} (Prefetch: ${prefetchCount})`);
    }

    async startConsumer(queueName, callback, prefetchCount, logLine) {
        const channel = await this.ensureChannel();
        channel.prefetch(prefetchCount);
        console.log(logLine);

        return channel.consume(queueName, async (msg) => {
            if (msg === null) return;

            try {
                const content = JSON.parse(msg.content.toString());
                await callback(content);
                try {
                    channel.ack(msg);
                } catch (ackError) {
                    console.error(`RabbitMQ ack failed for ${queueName}:`, ackError.message);
                }
            } catch (error) {
                console.error(`Error processing message from ${queueName}:`, error.message);
                try {
                    channel.nack(msg, false, false);
                } catch (nackError) {
                    console.error(`RabbitMQ nack failed for ${queueName}:`, nackError.message);
                }
            }
        });
    }

    async restoreConsumers() {
        for (const consumer of this.consumers) {
            const logLine = consumer.type === 'failed'
                ? `[*] Reconnected failed queue: ${consumer.queueName} (Prefetch: ${consumer.prefetchCount})`
                : `[*] Reconnected queue: ${consumer.queueName} (Prefetch: ${consumer.prefetchCount})`;
            await this.startConsumer(
                consumer.queueName,
                consumer.callback,
                consumer.prefetchCount,
                logLine
            );
        }
    }
}

module.exports = new RabbitMQManager();
