/**
 * Codex Session Reader
 *
 * Reads and parses Codex session files from ~/.codex/sessions/
 * Each session file is in JSONL format (one JSON object per line)
 */
import { readFile, stat, readdir } from 'fs/promises';
import { join, basename } from 'path';
import { existsSync } from 'fs';
import Watcher from 'watcher';
import { logger } from '../utils/logger.js';
// Codex session file path
const CODEX_SESSIONS_DIR = join(process.env.HOME || process.env.USERPROFILE || '', '.codex', 'sessions');
/**
 * Codex Session Reader class
 */
export class CodexSessionReader {
    sessionsDir;
    watchers = new Map();
    constructor(sessionsDir = CODEX_SESSIONS_DIR) {
        this.sessionsDir = sessionsDir;
    }
    /**
     * Get all session files (most recent first)
     */
    async getSessionFiles(limit = 50) {
        if (!existsSync(this.sessionsDir)) {
            logger.warn('CodexSessionReader', 'Sessions directory not found', { path: this.sessionsDir });
            return [];
        }
        // Recursively find all .jsonl files
        const files = [];
        await this.findJsonlFiles(this.sessionsDir, files);
        // Sort by modification time (most recent first)
        const fileStats = await Promise.all(files.map(async (file) => {
            const stats = await stat(file);
            return { file, mtime: stats.mtimeMs };
        }));
        fileStats.sort((a, b) => b.mtime - a.mtime);
        return fileStats.slice(0, limit).map(f => f.file);
    }
    /**
     * Recursively find all .jsonl files
     */
    async findJsonlFiles(dir, files) {
        const entries = await readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = join(dir, entry.name);
            if (entry.isDirectory()) {
                await this.findJsonlFiles(fullPath, files);
            }
            else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
                files.push(fullPath);
            }
        }
    }
    /**
     * Read and parse a session file
     */
    async readSessionFile(filePath) {
        try {
            const content = await readFile(filePath, 'utf-8');
            const lines = content.trim().split('\n');
            const messages = [];
            for (const line of lines) {
                if (!line.trim())
                    continue;
                try {
                    const msg = JSON.parse(line);
                    messages.push(msg);
                }
                catch (err) {
                    logger.warn('CodexSessionReader', 'Failed to parse line', {
                        file: filePath,
                        error: String(err),
                        line: line.substring(0, 100)
                    });
                }
            }
            logger.info('CodexSessionReader', 'Session file loaded', {
                file: basename(filePath),
                messages: messages.length
            });
            return messages;
        }
        catch (err) {
            logger.error('CodexSessionReader', 'Failed to read session file', {
                file: filePath,
                error: String(err)
            });
            return [];
        }
    }
    /**
     * Parse Codex messages into Visualizer format
     */
    parseToVisualizerFormat(messages) {
        const parsed = [];
        let sessionId = 'unknown';
        for (const msg of messages) {
            // Extract session ID from session_meta
            if (msg.type === 'session_meta' && msg.payload?.id) {
                sessionId = msg.payload.id;
            }
            // Parse based on message type
            const parsedMsg = this.parseMessage(msg, sessionId);
            if (parsedMsg) {
                parsed.push(parsedMsg);
            }
        }
        return parsed;
    }
    /**
     * Parse individual message
     */
    parseMessage(msg, sessionId) {
        const timestamp = msg.timestamp || new Date().toISOString();
        const id = `${msg.type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        // User input messages
        if (msg.type === 'user_msg' || (msg.type === 'response_item' && msg.payload?.role === 'user')) {
            return {
                id,
                timestamp,
                sessionId,
                type: 'user-input',
                source: 'user',
                content: {
                    text: this.extractTextContent(msg.payload),
                    ...msg.payload
                }
            };
        }
        // Agent/Developer responses
        if (msg.type === 'response_item' && msg.payload?.role === 'developer') {
            return {
                id,
                timestamp,
                sessionId,
                type: 'agent-response',
                source: 'supervisor',
                content: {
                    text: this.extractTextContent(msg.payload),
                    ...msg.payload
                }
            };
        }
        // Tool use messages (worker calling tools)
        if (msg.type === 'tool_use' || (msg.type === 'response_item' && msg.payload?.type === 'tool_use')) {
            const toolName = msg.payload?.name || 'unknown-tool';
            return {
                id,
                timestamp,
                sessionId,
                type: 'tool-call',
                source: 'worker',
                content: {
                    tool: toolName,
                    args: msg.payload?.input || msg.payload?.arguments || {},
                    ...msg.payload
                }
            };
        }
        // Tool results
        if (msg.type === 'response_item' && msg.payload?.type === 'tool_result') {
            return {
                id,
                timestamp,
                sessionId,
                type: 'tool-result',
                source: 'supervisor',
                content: {
                    tool: msg.payload?.name || 'unknown-tool',
                    result: msg.payload?.content || msg.payload?.output || {},
                    ...msg.payload
                }
            };
        }
        // Event/status messages
        if (msg.type === 'event_msg') {
            const eventType = msg.payload?.type || 'unknown-event';
            return {
                id,
                timestamp,
                sessionId,
                type: 'status',
                source: 'supervisor',
                content: {
                    event: eventType,
                    ...msg.payload
                }
            };
        }
        // Skip uninteresting messages
        return null;
    }
    /**
     * Extract text content from payload
     */
    extractTextContent(payload) {
        if (payload?.content && Array.isArray(payload.content)) {
            // Extract text from content array
            const texts = payload.content
                .filter((item) => item.type === 'text' || item.type === 'input_text')
                .map((item) => item.text || '')
                .join('\n');
            return texts;
        }
        if (payload?.text) {
            return payload.text;
        }
        return '';
    }
    /**
     * Get session info by session ID
     */
    async getSessionById(sessionId) {
        const files = await this.getSessionFiles();
        for (const file of files) {
            const messages = await this.readSessionFile(file);
            const sessionMeta = messages.find(m => m.type === 'session_meta' && m.payload?.id === sessionId);
            if (sessionMeta) {
                return this.parseToVisualizerFormat(messages);
            }
        }
        return [];
    }
    /**
     * Watch for new session file changes (real-time updates)
     */
    watchSessionFile(filePath, callback) {
        if (this.watchers.has(filePath)) {
            return; // Already watching
        }
        const watcher = new Watcher(filePath, { persistent: false });
        watcher.on('change', async () => {
            logger.info('CodexSessionReader', 'Session file changed', { file: basename(filePath) });
            // Read new lines (simplified: read entire file)
            const messages = await this.readSessionFile(filePath);
            const parsed = this.parseToVisualizerFormat(messages);
            // Send last parsed message (newest)
            if (parsed.length > 0) {
                const lastMsg = parsed[parsed.length - 1];
                if (lastMsg) {
                    callback(lastMsg);
                }
            }
        });
        watcher.on('error', (err) => {
            logger.error('CodexSessionReader', 'Watcher error', { error: String(err) });
        });
        this.watchers.set(filePath, watcher);
    }
    /**
     * Stop all watchers
     */
    stopWatching() {
        for (const [file, watcher] of this.watchers.entries()) {
            watcher.close();
            logger.info('CodexSessionReader', 'Watcher closed', { file: basename(file) });
        }
        this.watchers.clear();
    }
}
//# sourceMappingURL=codex-session-reader.js.map