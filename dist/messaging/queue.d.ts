/**
 * Message queue factory - creates appropriate queue implementation
 */
export interface MessageQueue {
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    isConnected(): boolean;
    subscribe(channel: string, handler: import('./types.js').MessageHandler): Promise<void>;
    unsubscribe(channel: string): Promise<void>;
    publish(channel: string, message: import('./types.js').SupervisorMessage): Promise<void>;
    enqueue(queueName: string, message: import('./types.js').SupervisorMessage): Promise<void>;
    dequeue(queueName: string): Promise<import('./types.js').SupervisorMessage | null>;
    peek(queueName: string): Promise<import('./types.js').SupervisorMessage[]>;
}
/**
 * Create message queue instance
 * Uses Redis if CODEX_REDIS_URL is set, otherwise falls back to in-memory queue
 */
export declare function createMessageQueue(): MessageQueue;
/**
 * Check if Redis is available
 */
export declare function isRedisAvailable(redisUrl?: string): Promise<boolean>;
//# sourceMappingURL=queue.d.ts.map