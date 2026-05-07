/**
 * Message log for persistent message storage (JSONL format)
 */
import type { BaseMessage } from '../messaging/types.js';
export declare class MessageLog {
    private projectId;
    constructor(projectId: string);
    /**
     * Append a message to the log
     */
    append(message: BaseMessage): Promise<void>;
    /**
     * Read all messages from the log
     */
    readAll(): Promise<BaseMessage[]>;
    /**
     * Read messages since a specific timestamp
     */
    readSince(timestamp: string): Promise<BaseMessage[]>;
    /**
     * Read messages for a specific session
     */
    readForSession(sessionId: string): Promise<BaseMessage[]>;
    /**
     * Clear the log
     */
    clear(): Promise<void>;
    /**
     * Get message count
     */
    count(): Promise<number>;
}
//# sourceMappingURL=message-log.d.ts.map