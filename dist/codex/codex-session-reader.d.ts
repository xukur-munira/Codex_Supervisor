/**
 * Codex Session Reader
 *
 * Reads and parses Codex session files from ~/.codex/sessions/
 * Each session file is in JSONL format (one JSON object per line)
 */
export interface CodexSessionMessage {
    timestamp: string;
    type: 'session_meta' | 'event_msg' | 'response_item' | 'tool_use' | 'user_msg';
    payload: Record<string, unknown>;
}
export interface ParsedVisualizerMessage {
    id: string;
    timestamp: string;
    sessionId: string;
    type: 'tool-call' | 'tool-result' | 'status' | 'progress' | 'error' | 'user-input' | 'agent-response';
    source: 'worker' | 'supervisor' | 'user';
    content: Record<string, unknown>;
}
/**
 * Codex Session Reader class
 */
export declare class CodexSessionReader {
    private sessionsDir;
    private watchers;
    constructor(sessionsDir?: string);
    /**
     * Get all session files (most recent first)
     */
    getSessionFiles(limit?: number): Promise<string[]>;
    /**
     * Recursively find all .jsonl files
     */
    private findJsonlFiles;
    /**
     * Read and parse a session file
     */
    readSessionFile(filePath: string): Promise<CodexSessionMessage[]>;
    /**
     * Parse Codex messages into Visualizer format
     */
    parseToVisualizerFormat(messages: CodexSessionMessage[]): ParsedVisualizerMessage[];
    /**
     * Parse individual message
     */
    private parseMessage;
    /**
     * Extract text content from payload
     */
    private extractTextContent;
    /**
     * Get session info by session ID
     */
    getSessionById(sessionId: string): Promise<ParsedVisualizerMessage[]>;
    /**
     * Watch for new session file changes (real-time updates)
     */
    watchSessionFile(filePath: string, callback: (msg: ParsedVisualizerMessage) => void): void;
    /**
     * Stop all watchers
     */
    stopWatching(): void;
}
//# sourceMappingURL=codex-session-reader.d.ts.map