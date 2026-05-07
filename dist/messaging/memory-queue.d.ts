/**
 * In-memory message queue implementation (fallback when Redis is not available)
 */
import type { MessageHandler, SupervisorMessage } from './types.js';
export declare class MemoryQueue {
    private handlers;
    private queues;
    private connected;
    /**
     * Connect to the queue (no actual connection needed for memory queue)
     */
    connect(): Promise<void>;
    /**
     * Disconnect from the queue
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
     * Enqueue a message to a named queue (persistent)
     */
    enqueue(queueName: string, message: SupervisorMessage): Promise<void>;
    /**
     * Dequeue a message from a named queue
     */
    dequeue(queueName: string): Promise<SupervisorMessage | null>;
    /**
     * Peek at messages in a queue without removing them
     */
    peek(queueName: string): Promise<SupervisorMessage[]>;
    /**
     * Get queue length
     */
    getQueueLength(queueName: string): number;
    /**
     * Clear a queue
     */
    clearQueue(queueName: string): Promise<void>;
    /**
     * Get all active channels
     */
    getActiveChannels(): string[];
    /**
     * Get all queue names
     */
    getQueueNames(): string[];
}
//# sourceMappingURL=memory-queue.d.ts.map