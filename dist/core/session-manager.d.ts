/**
 * Session Manager
 *
 * The original implementation stored all sessions in one shared JSON file.
 * That design loses updates as soon as two MCP server processes write at the
 * same time. Persist each session independently so concurrent MCP sessions do
 * not overwrite each other.
 */
export interface Session {
    id: string;
    createdAt: Date;
    lastActivity: Date;
    projectId?: string;
    workers: Map<string, SessionWorker>;
    metadata: Record<string, unknown>;
}
export interface SessionWorker {
    id: string;
    type: 'virtual' | 'process';
    createdAt: Date;
    lastHeartbeat: Date;
    currentTaskId?: string;
    status: 'idle' | 'working' | 'terminated';
}
export declare class SessionManager {
    private sessions;
    private sessionTimeoutMs;
    private sessionsDir;
    private legacyRegistryFile;
    private initialized;
    constructor();
    init(): Promise<void>;
    createSession(sessionId?: string): Session;
    getSession(sessionId: string): Session | undefined;
    getOrCreateSession(sessionId?: string): Session;
    touchSession(sessionId: string): void;
    setProject(sessionId: string, projectId: string): void;
    addWorker(sessionId: string, workerId: string, type: 'virtual' | 'process'): SessionWorker;
    updateWorkerHeartbeat(sessionId: string, workerId: string): void;
    setWorkerTask(sessionId: string, workerId: string, taskId?: string): void;
    terminateWorker(sessionId: string, workerId: string): void;
    findSessionByProject(projectId: string): Session[];
    findSessionByWorker(workerId: string): Session | undefined;
    listSessions(): Session[];
    getStats(): {
        totalSessions: number;
        activeSessions: number;
        totalWorkers: number;
        activeWorkers: number;
    };
    deleteSession(sessionId: string): void;
    private cleanupInactiveSessions;
    private startCleanupTimer;
    private ensureSessionsDir;
    private migrateLegacyRegistryIfNeeded;
    private refreshFromDisk;
    private readPersistedSession;
    private saveSession;
    private serializeSession;
    private deserializeSession;
}
export declare function getSessionManager(): SessionManager;
//# sourceMappingURL=session-manager.d.ts.map