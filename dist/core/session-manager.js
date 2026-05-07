/**
 * Session Manager
 *
 * The original implementation stored all sessions in one shared JSON file.
 * That design loses updates as soon as two MCP server processes write at the
 * same time. Persist each session independently so concurrent MCP sessions do
 * not overwrite each other.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, } from 'fs';
import { dirname } from 'path';
import { logger } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import { getLegacySessionRegistryFile, getSessionFile, getSessionsDir, } from '../utils/paths.js';
export class SessionManager {
    sessions = new Map();
    sessionTimeoutMs = 24 * 60 * 60 * 1000;
    sessionsDir = getSessionsDir();
    legacyRegistryFile = getLegacySessionRegistryFile();
    initialized = false;
    constructor() {
        this.startCleanupTimer();
    }
    async init() {
        if (this.initialized) {
            return;
        }
        this.ensureSessionsDir();
        this.migrateLegacyRegistryIfNeeded();
        this.refreshFromDisk();
        this.initialized = true;
    }
    createSession(sessionId) {
        this.refreshFromDisk();
        const existing = sessionId ? this.sessions.get(sessionId) : undefined;
        if (existing) {
            existing.lastActivity = new Date();
            this.saveSession(existing);
            return existing;
        }
        const now = new Date();
        const session = {
            id: sessionId || uuidv4(),
            createdAt: now,
            lastActivity: now,
            workers: new Map(),
            metadata: {},
        };
        this.sessions.set(session.id, session);
        this.saveSession(session);
        logger.info('SessionManager', `Session created: ${session.id}`);
        return session;
    }
    getSession(sessionId) {
        this.refreshFromDisk();
        return this.sessions.get(sessionId);
    }
    getOrCreateSession(sessionId) {
        if (sessionId) {
            const session = this.getSession(sessionId);
            if (session) {
                session.lastActivity = new Date();
                this.saveSession(session);
                return session;
            }
        }
        return this.createSession(sessionId);
    }
    touchSession(sessionId) {
        const session = this.getSession(sessionId);
        if (!session)
            return;
        session.lastActivity = new Date();
        this.saveSession(session);
    }
    setProject(sessionId, projectId) {
        const session = this.getSession(sessionId);
        if (!session) {
            return;
        }
        session.projectId = projectId;
        session.lastActivity = new Date();
        this.saveSession(session);
        logger.info('SessionManager', `Session ${sessionId} associated with project ${projectId}`);
    }
    addWorker(sessionId, workerId, type) {
        const session = this.getSession(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }
        const existing = session.workers.get(workerId);
        if (existing) {
            existing.lastHeartbeat = new Date();
            existing.status = existing.status === 'terminated' ? 'idle' : existing.status;
            session.lastActivity = new Date();
            this.saveSession(session);
            return existing;
        }
        const worker = {
            id: workerId,
            type,
            createdAt: new Date(),
            lastHeartbeat: new Date(),
            status: 'idle',
        };
        session.workers.set(workerId, worker);
        session.lastActivity = new Date();
        this.saveSession(session);
        logger.info('SessionManager', `Worker ${workerId} added to session ${sessionId}`);
        return worker;
    }
    updateWorkerHeartbeat(sessionId, workerId) {
        const session = this.getSession(sessionId);
        if (!session)
            return;
        const worker = session.workers.get(workerId);
        if (!worker)
            return;
        worker.lastHeartbeat = new Date();
        worker.status = 'working';
        session.lastActivity = new Date();
        this.saveSession(session);
    }
    setWorkerTask(sessionId, workerId, taskId) {
        const session = this.getSession(sessionId);
        if (!session)
            return;
        const worker = session.workers.get(workerId);
        if (!worker)
            return;
        worker.currentTaskId = taskId;
        worker.status = taskId ? 'working' : 'idle';
        worker.lastHeartbeat = new Date();
        session.lastActivity = new Date();
        this.saveSession(session);
    }
    terminateWorker(sessionId, workerId) {
        const session = this.getSession(sessionId);
        if (!session)
            return;
        const worker = session.workers.get(workerId);
        if (!worker)
            return;
        worker.status = 'terminated';
        worker.lastHeartbeat = new Date();
        session.lastActivity = new Date();
        this.saveSession(session);
        logger.info('SessionManager', `Worker ${workerId} terminated in session ${sessionId}`);
    }
    findSessionByProject(projectId) {
        return this.listSessions().filter(session => session.projectId === projectId);
    }
    findSessionByWorker(workerId) {
        return this.listSessions().find(session => session.workers.has(workerId));
    }
    listSessions() {
        this.refreshFromDisk();
        const cutoff = Date.now() - this.sessionTimeoutMs;
        return Array.from(this.sessions.values()).filter(session => session.lastActivity.getTime() >= cutoff);
    }
    getStats() {
        const activeSessions = this.listSessions();
        let totalWorkers = 0;
        let activeWorkers = 0;
        for (const session of activeSessions) {
            totalWorkers += session.workers.size;
            for (const worker of session.workers.values()) {
                if (worker.status !== 'terminated') {
                    activeWorkers++;
                }
            }
        }
        return {
            totalSessions: this.sessions.size,
            activeSessions: activeSessions.length,
            totalWorkers,
            activeWorkers,
        };
    }
    deleteSession(sessionId) {
        this.refreshFromDisk();
        this.sessions.delete(sessionId);
        const sessionFile = getSessionFile(sessionId);
        if (existsSync(sessionFile)) {
            rmSync(sessionFile, { force: true });
        }
        logger.info('SessionManager', `Session ${sessionId} deleted`);
    }
    cleanupInactiveSessions() {
        this.refreshFromDisk();
        const cutoff = Date.now() - this.sessionTimeoutMs;
        const staleIds = [];
        for (const [id, session] of this.sessions.entries()) {
            if (session.lastActivity.getTime() < cutoff) {
                staleIds.push(id);
            }
        }
        if (staleIds.length === 0) {
            return;
        }
        for (const id of staleIds) {
            this.deleteSession(id);
            logger.info('SessionManager', `Session ${id} cleaned up (inactive)`);
        }
    }
    startCleanupTimer() {
        const timer = setInterval(() => {
            this.cleanupInactiveSessions();
        }, 5 * 60 * 1000);
        timer.unref?.();
    }
    ensureSessionsDir() {
        mkdirSync(this.sessionsDir, { recursive: true });
    }
    migrateLegacyRegistryIfNeeded() {
        if (!existsSync(this.legacyRegistryFile)) {
            return;
        }
        try {
            const content = readFileSync(this.legacyRegistryFile, 'utf-8');
            const parsed = JSON.parse(content);
            for (const persistedSession of parsed.sessions || []) {
                const sessionFile = getSessionFile(persistedSession.id);
                if (!existsSync(sessionFile)) {
                    mkdirSync(dirname(sessionFile), { recursive: true });
                    writeFileSync(sessionFile, JSON.stringify(persistedSession, null, 2), 'utf-8');
                }
            }
            logger.info('SessionManager', 'Legacy session registry migrated', {
                count: parsed.sessions?.length || 0,
            });
        }
        catch (error) {
            logger.warn('SessionManager', 'Failed to migrate legacy session registry', {
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }
    refreshFromDisk() {
        this.ensureSessionsDir();
        const loadedSessions = new Map();
        const entries = readdirSync(this.sessionsDir, { withFileTypes: true });
        for (const entry of entries) {
            if (!entry.isFile() || !entry.name.endsWith('.json')) {
                continue;
            }
            const sessionId = entry.name.slice(0, -5);
            const persisted = this.readPersistedSession(sessionId);
            if (persisted) {
                loadedSessions.set(sessionId, this.deserializeSession(persisted));
            }
        }
        this.sessions = loadedSessions;
    }
    readPersistedSession(sessionId) {
        const file = getSessionFile(sessionId);
        try {
            const content = readFileSync(file, 'utf-8');
            return JSON.parse(content);
        }
        catch {
            return null;
        }
    }
    saveSession(session) {
        const file = getSessionFile(session.id);
        const persisted = this.serializeSession(session);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, JSON.stringify(persisted, null, 2), 'utf-8');
    }
    serializeSession(session) {
        return {
            id: session.id,
            createdAt: session.createdAt.toISOString(),
            lastActivity: session.lastActivity.toISOString(),
            projectId: session.projectId,
            workers: Array.from(session.workers.values()).map(worker => ({
                id: worker.id,
                type: worker.type,
                createdAt: worker.createdAt.toISOString(),
                lastHeartbeat: worker.lastHeartbeat.toISOString(),
                currentTaskId: worker.currentTaskId,
                status: worker.status,
            })),
            metadata: session.metadata,
        };
    }
    deserializeSession(persistedSession) {
        return {
            id: persistedSession.id,
            createdAt: new Date(persistedSession.createdAt),
            lastActivity: new Date(persistedSession.lastActivity),
            projectId: persistedSession.projectId,
            workers: new Map((persistedSession.workers || []).map(worker => [
                worker.id,
                {
                    id: worker.id,
                    type: worker.type,
                    createdAt: new Date(worker.createdAt),
                    lastHeartbeat: new Date(worker.lastHeartbeat),
                    currentTaskId: worker.currentTaskId,
                    status: worker.status,
                },
            ])),
            metadata: persistedSession.metadata || {},
        };
    }
}
let sessionManager = null;
export function getSessionManager() {
    if (!sessionManager) {
        sessionManager = new SessionManager();
    }
    return sessionManager;
}
//# sourceMappingURL=session-manager.js.map