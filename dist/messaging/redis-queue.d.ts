/**
 * Redis message queue implementation
 */
import type { MessageHandler, SupervisorMessage } from './types.js';
export declare class RedisQueue {
    private pubClient;
    private subClient;
    private handlers;
    private connected;
    private reconnectAttempts;
    private maxReconnectAttempts;
    private redisUrl;
    private RedisCtor;
    constructor(redisUrl: string);
    private setupErrorHandlers;
    /**
     * Connect to Redis
     */
    connect(): Promise<void>;
    /**
     * Disconnect from Redis
     */
    disconnect(): Promise<void>;
    /**
     * Check if connected
     */
    isConnected(): boolean;
    /**
     * Subscribe to a channel
     */
    subscribe(channel: string, handler: MessageHandler): Promise<void>;
    /**
     * Unsubscribe from a channel
     */
    unsubscribe(channel: string): Promise<void>;
    /**
     * Publish a message to a channel
     */
    publish(channel: string, message: SupervisorMessage): Promise<void>;
    /**
     * Enqueue a message to a Redis list (persistent queue)
     */
    enqueue(queueName: string, message: SupervisorMessage): Promise<void>;
    /**
     * Dequeue a message from a Redis list
     */
    dequeue(queueName: string): Promise<SupervisorMessage | null>;
    /**
     * Peek at messages in a queue without removing them
     */
    peek(queueName: string): Promise<SupervisorMessage[]>;
    /**
     * Get queue length
     */
    getQueueLength(queueName: string): Promise<number>;
    /**
     * Clear a queue
     */
    clearQueue(queueName: string): Promise<void>;
    /**
     * Get all active channels
     */
    getActiveChannels(): string[];
}
//# sourceMappingURL=redis-queue.d.ts.map