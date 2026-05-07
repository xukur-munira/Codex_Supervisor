/**
 * In-memory message queue implementation (fallback when Redis is not available)
 */
import { logger } from '../utils/logger.js';
import { generateId } from '../utils/common.js';
export class MemoryQueue {
    handlers = new Map();
    queues = new Map();
    connected = false;
    /**
     * Connect to the queue (no actual connection needed for memory queue)
     */
    async connect() {
        this.connected = true;
        logger.info('MemoryQueue', 'Connected (in-memory mode)');
    }
    /**
     * Disconnect from the queue
     */
    async disconnect() {
        this.connected = false;
        this.handlers.clear();
        this.queues.clear();
        logger.info('MemoryQueue', 'Disconnected');
    }
    /**
     * Check if connected
     */
    isConnected() {
        return this.connected;
    }
    /**
     * Subscribe to a channel
     */
    async subscribe(channel, handler) {
        if (!this.handlers.has(channel)) {
            this.handlers.set(channel, new Set());
        }
        this.handlers.get(channel)?.add(handler);
        logger.debug('MemoryQueue', 'Subscribed to channel', { channel });
        // Deliver any queued messages for this channel
        const queued = this.queues.get(channel) || [];
        for (const msg of queued) {
            await handler(msg);
        }
        this.queues.delete(channel);
    }
    /**
     * Unsubscribe from a channel
     */
    async unsubscribe(channel) {
        this.handlers.delete(channel);
        logger.debug('MemoryQueue', 'Unsubscribed from channel', { channel });
    }
    /**
     * Publish a message to a channel
     */
    async publish(channel, message) {
        // Ensure message has required fields
        if (!message.id) {
            message.id = generateId();
        }
        if (!message.timestamp) {
            message.timestamp = new Date().toISOString();
        }
        const handlers = this.handlers.get(channel);
        if (handlers && handlers.size > 0) {
            // Deliver to all subscribers
            for (const handler of handlers) {
                try {
                    await handler(message);
                }
                catch (error) {
                    logger.error('MemoryQueue', 'Handler error', { channel, error });
                }
            }
        }
        else {
            // Queue the message if no subscribers
            if (!this.queues.has(channel)) {
                this.queues.set(channel, []);
            }
            this.queues.get(channel)?.push(message);
            logger.debug('MemoryQueue', 'Message queued (no subscribers)', { channel });
        }
    }
    /**
     * Enqueue a message to a named queue (persistent)
     */
    async enqueue(queueName, message) {
        if (!this.queues.has(queueName)) {
            this.queues.set(queueName, []);
        }
        this.queues.get(queueName)?.push(message);
        logger.debug('MemoryQueue', 'Message enqueued', { queueName, messageId: message.id });
    }
    /**
     * Dequeue a message from a named queue
     */
    async dequeue(queueName) {
        const queue = this.queues.get(queueName);
        if (!queue || queue.length === 0) {
            return null;
        }
        const message = queue.shift();
        logger.debug('MemoryQueue', 'Message dequeued', { queueName, messageId: message?.id });
        return message || null;
    }
    /**
     * Peek at messages in a queue without removing them
     */
    async peek(queueName) {
        return this.queues.get(queueName) || [];
    }
    /**
     * Get queue length
     */
    getQueueLength(queueName) {
        return this.queues.get(queueName)?.length || 0;
    }
    /**
     * Clear a queue
     */
    async clearQueue(queueName) {
        this.queues.delete(queueName);
    }
    /**
     * Get all active channels
     */
    getActiveChannels() {
        return Array.from(this.handlers.keys());
    }
    /**
     * Get all queue names
     */
    getQueueNames() {
        return Array.from(this.queues.keys());
    }
}
//# sourceMappingURL=memory-queue.js.map