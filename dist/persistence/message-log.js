/**
 * Message log for persistent message storage (JSONL format)
 */
import { ensureDir } from '../utils/common.js';
import { getMessagesFile } from '../utils/paths.js';
import { logger } from '../utils/logger.js';
import { dirname } from 'path';
export class MessageLog {
    projectId;
    constructor(projectId) {
        this.projectId = projectId;
    }
    /**
     * Append a message to the log
     */
    async append(message) {
        const fs = await import('fs/promises');
        const messagesFile = getMessagesFile(this.projectId);
        await ensureDir(dirname(messagesFile));
        const line = JSON.stringify(message) + '\n';
        await fs.appendFile(messagesFile, line, 'utf-8');
    }
    /**
     * Read all messages from the log
     */
    async readAll() {
        const fs = await import('fs/promises');
        const messagesFile = getMessagesFile(this.projectId);
        try {
            const content = await fs.readFile(messagesFile, 'utf-8');
            const lines = content.trim().split('\n');
            const messages = [];
            for (const line of lines) {
                if (line.trim()) {
                    try {
                        messages.push(JSON.parse(line));
                    }
                    catch {
                        logger.warn('MessageLog', 'Failed to parse message line', { line });
                    }
                }
            }
            return messages;
        }
        catch {
            return [];
        }
    }
    /**
     * Read messages since a specific timestamp
     */
    async readSince(timestamp) {
        const messages = await this.readAll();
        const cutoff = new Date(timestamp).getTime();
        return messages.filter(m => new Date(m.timestamp).getTime() >= cutoff);
    }
    /**
     * Read messages for a specific session
     */
    async readForSession(sessionId) {
        const messages = await this.readAll();
        return messages.filter(m => m.sessionId === sessionId);
    }
    /**
     * Clear the log
     */
    async clear() {
        const fs = await import('fs/promises');
        const messagesFile = getMessagesFile(this.projectId);
        try {
            await fs.unlink(messagesFile);
        }
        catch {
            // File doesn't exist
        }
    }
    /**
     * Get message count
     */
    async count() {
        const messages = await this.readAll();
        return messages.length;
    }
}
//# sourceMappingURL=message-log.js.map