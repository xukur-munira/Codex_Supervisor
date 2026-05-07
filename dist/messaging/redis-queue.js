/**
 * Redis message queue implementation
 */
import { logger } from '../utils/logger.js';
import { generateId } from '../utils/common.js';
export class RedisQueue {
    pubClient = null;
    subClient = null;
    handlers = new Map();
    connected = false;
    reconnectAttempts = 0;
    maxReconnectAttempts = 10;
    redisUrl;
    RedisCtor = null;
    constructor(redisUrl) {
        this.redisUrl = redisUrl;
    }
    setupErrorHandlers() {
        if (!this.pubClient || !this.subClient)
            return;
        this.pubClient.on('error', (error) => {
            logger.error('RedisQueue', 'Pub client error', { error: error.message });
        });
        this.subClient.on('error', (error) => {
            logger.error('RedisQueue', 'Sub client error', { error: error.message });
        });
        this.pubClient.on('reconnecting', () => {
            this.reconnectAttempts++;
            logger.warn('RedisQueue', 'Pub client reconnecting', { attempts: this.reconnectAttempts });
        });
        this.subClient.on('reconnecting', () => {
            logger.warn('RedisQueue', 'Sub client reconnecting');
        });
        this.pubClient.on('ready', () => {
            logger.info('RedisQueue', 'Pub client ready');
        });
        this.subClient.on('ready', () => {
            logger.info('RedisQueue', 'Sub client ready');
        });
    }
    /**
     * Connect to Redis
     */
    async connect() {
        try {
            // Dynamic import for ESM compatibility
            const ioredis = await import('ioredis');
            this.RedisCtor = ioredis.default;
            this.pubClient = new this.RedisCtor(this.redisUrl, {
                maxRetriesPerRequest: 3,
                retryDelayOnFailover: 100,
                enableReadyCheck: true,
            });
            this.subClient = new this.RedisCtor(this.redisUrl, {
                maxRetriesPerRequest: null, // Allow infinite retries for subscriber
                retryDelayOnFailover: 100,
                enableReadyCheck: true,
            });
            this.setupErrorHandlers();
            await this.pubClient.ping();
            await this.subClient.ping();
            this.connected = true;
            this.reconnectAttempts = 0;
            logger.info('RedisQueue', 'Connected to Redis');
        }
        catch (error) {
            logger.error('RedisQueue', 'Connection failed', { error });
            throw error;
        }
    }
    /**
     * Disconnect from Redis
     */
    async disconnect() {
        this.connected = false;
        if (this.subClient) {
            // Unsubscribe from all channels
            const channels = Array.from(this.handlers.keys());
            if (channels.length > 0) {
                await this.subClient.unsubscribe(...channels);
            }
            await this.subClient.quit();
        }
        if (this.pubClient) {
            await this.pubClient.quit();
        }
        this.handlers.clear();
        logger.info('RedisQueue', 'Disconnected from Redis');
    }
    /**
     * Check if connected
     */
    isConnected() {
        return this.connected &&
            this.pubClient?.status === 'ready' &&
            this.subClient?.status === 'ready';
    }
    /**
     * Subscribe to a channel
     */
    async subscribe(channel, handler) {
        if (!this.subClient) {
            throw new Error('Redis not connected');
        }
        this.handlers.set(channel, handler);
        await this.subClient.subscribe(channel);
        logger.debug('RedisQueue', 'Subscribed to channel', { channel });
        // Set up message handler for this subscription
        this.subClient.on('message', async (ch, messageStr) => {
            if (ch === channel) {
                try {
                    const message = JSON.parse(messageStr);
                    await handler(message);
                }
                catch (error) {
                    logger.error('RedisQueue', 'Failed to handle message', { channel, error });
                }
            }
        });
    }
    /**
     * Unsubscribe from a channel
     */
    async unsubscribe(channel) {
        if (!this.subClient)
            return;
        this.handlers.delete(channel);
        await this.subClient.unsubscribe(channel);
        logger.debug('RedisQueue', 'Unsubscribed from channel', { channel });
    }
    /**
     * Publish a message to a channel
     */
    async publish(channel, message) {
        if (!this.pubClient) {
            throw new Error('Redis not connected');
        }
        // Ensure message has required fields
        if (!message.id) {
            message.id = generateId();
        }
        if (!message.timestamp) {
            message.timestamp = new Date().toISOString();
        }
        const messageStr = JSON.stringify(message);
        await this.pubClient.publish(channel, messageStr);
        logger.debug('RedisQueue', 'Message published', { channel, messageId: message.id });
    }
    /**
     * Enqueue a message to a Redis list (persistent queue)
     */
    async enqueue(queueName, message) {
        if (!this.pubClient) {
            throw new Error('Redis not connected');
        }
        if (!message.id) {
            message.id = generateId();
        }
        if (!message.timestamp) {
            message.timestamp = new Date().toISOString();
        }
        const messageStr = JSON.stringify(message);
        await this.pubClient.rpush(queueName, messageStr);
        logger.debug('RedisQueue', 'Message enqueued', { queueName, messageId: message.id });
    }
    /**
     * Dequeue a message from a Redis list
     */
    async dequeue(queueName) {
        if (!this.pubClient) {
            throw new Error('Redis not connected');
        }
        const messageStr = await this.pubClient.lpop(queueName);
        if (!messageStr) {
            return null;
        }
        try {
            const message = JSON.parse(messageStr);
            logger.debug('RedisQueue', 'Message dequeued', { queueName, messageId: message.id });
            return message;
        }
        catch (error) {
            logger.error('RedisQueue', 'Failed to parse dequeued message', { queueName, error });
            return null;
        }
    }
    /**
     * Peek at messages in a queue without removing them
     */
    async peek(queueName) {
        if (!this.pubClient) {
            throw new Error('Redis not connected');
        }
        const messages = await this.pubClient.lrange(queueName, 0, -1);
        return messages.map((msgStr) => {
            try {
                return JSON.parse(msgStr);
            }
            catch {
                logger.error('RedisQueue', 'Failed to parse peeked message', { queueName });
                return null;
            }
        }).filter((msg) => msg !== null);
    }
    /**
     * Get queue length
     */
    async getQueueLength(queueName) {
        if (!this.pubClient) {
            throw new Error('Redis not connected');
        }
        return this.pubClient.llen(queueName);
    }
    /**
     * Clear a queue
     */
    async clearQueue(queueName) {
        if (!this.pubClient)
            return;
        await this.pubClient.del(queueName);
        logger.debug('RedisQueue', 'Queue cleared', { queueName });
    }
    /**
     * Get all active channels
     */
    getActiveChannels() {
        return Array.from(this.handlers.keys());
    }
}
//# sourceMappingURL=redis-queue.js.map