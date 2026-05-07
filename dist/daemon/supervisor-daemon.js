import { createServer } from 'http';
import { parse } from 'url';
import { dirname } from 'path';
import { mkdir, writeFile } from 'fs/promises';
import { Supervisor } from '../core/supervisor.js';
import { getSessionManager } from '../core/session-manager.js';
import { SessionBindingManager } from '../core/session-binding.js';
import { RealtimeMonitorService } from '../core/realtime-monitor.js';
import { RestApiBroadcaster } from '../api/rest-broadcaster.js';
import { RestApiServer } from '../api/rest-server.js';
import { createMessageQueue } from '../messaging/queue.js';
import { logger } from '../utils/logger.js';
import { getDaemonStateFile } from '../utils/paths.js';
function isAddressInUse(error) {
    return error instanceof Error && 'code' in error && error.code === 'EADDRINUSE';
}
function getTimeoutMs(envValue, fallbackMs) {
    const parsed = Number(envValue);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallbackMs;
    }
    return parsed;
}
export class SupervisorDaemon {
    supervisor;
    sessionManager = getSessionManager();
    bindingManager = new SessionBindingManager();
    monitorService = new RealtimeMonitorService(this.bindingManager);
    restServer = null;
    restServerPort = parseInt(process.env.CODEX_PORT || '3000', 10);
    controlPort = parseInt(process.env.CODEX_DAEMON_CONTROL_PORT || '0', 10);
    controlServer = createServer(this.handleRequest.bind(this));
    transportDisconnectGraceMs = getTimeoutMs(process.env.CODEX_TRANSPORT_DISCONNECT_GRACE_MS, 4 * 60 * 60 * 1000);
    constructor() {
        this.supervisor = new Supervisor(createMessageQueue());
    }
    async start() {
        await this.sessionManager.init();
        await this.supervisor.init();
        this.monitorService.setBroadcastCallback((msg) => {
            if (this.restServer instanceof RestApiServer) {
                this.restServer.broadcastToVisualizer({
                    timestamp: msg.timestamp,
                    type: msg.type,
                    source: msg.source,
                    content: {
                        ...msg.content,
                        id: msg.id,
                        projectId: '',
                        sessionId: msg.mainSessionId,
                    },
                });
            }
        });
        await this.startRestServerBackground();
        await this.startControlServer();
        await this.persistState();
    }
    async stop() {
        await this.supervisor.cleanup({ terminateWorkers: false, graceful: true });
        if (this.restServer) {
            await this.restServer.stop();
        }
        await new Promise((resolve) => this.controlServer.close(() => resolve()));
    }
    async startRestServerBackground() {
        if (this.restServerPort > 0) {
            try {
                const response = await fetch(`http://localhost:${this.restServerPort}/health`);
                if (response.ok) {
                    logger.info('SupervisorDaemon', `REST API server already running on port ${this.restServerPort}`);
                    this.restServer = new RestApiBroadcaster(this.restServerPort);
                    return;
                }
            }
            catch {
                // ignore and start local server
            }
        }
        try {
            this.restServer = new RestApiServer(this.restServerPort);
            await this.restServer.start();
            this.restServerPort = this.restServer.getPort();
            logger.info('SupervisorDaemon', `REST API server started on port ${this.restServerPort}`);
            return;
        }
        catch (error) {
            if (!isAddressInUse(error)) {
                throw error;
            }
            logger.warn('SupervisorDaemon', 'Configured REST API port is occupied by another process; using a fallback port for the visualizer', {
                requestedPort: this.restServerPort,
            });
        }
        this.restServer = new RestApiServer(0);
        await this.restServer.start();
        this.restServerPort = this.restServer.getPort();
        logger.info('SupervisorDaemon', `REST API server started on fallback port ${this.restServerPort}`);
    }
    async startControlServer() {
        await new Promise((resolve, reject) => {
            const onError = (error) => {
                this.controlServer.off('listening', onListening);
                reject(error);
            };
            const onListening = () => {
                this.controlServer.off('error', onError);
                resolve();
            };
            this.controlServer.once('error', onError);
            this.controlServer.once('listening', onListening);
            this.controlServer.listen(this.controlPort, '127.0.0.1');
        });
        const address = this.controlServer.address();
        if (!address || typeof address === 'string') {
            throw new Error('Failed to determine daemon control server port');
        }
        this.controlPort = address.port;
        logger.info('SupervisorDaemon', `Daemon control server started on port ${this.controlPort}`, {
            restServerPort: this.restServerPort,
            graceMs: this.transportDisconnectGraceMs,
        });
    }
    async persistState() {
        const state = {
            pid: process.pid,
            port: this.controlPort,
            startedAt: new Date().toISOString(),
            restServerPort: this.restServerPort,
            dataDir: process.env.CODEX_DATA_DIR || '',
        };
        const stateFile = getDaemonStateFile();
        await mkdir(dirname(stateFile), { recursive: true });
        await writeFile(stateFile, JSON.stringify(state, null, 2), 'utf-8');
    }
    async handleRequest(req, res) {
        const parsedUrl = parse(req.url || '', true);
        const pathname = parsedUrl.pathname || '';
        if (req.method === 'GET' && pathname === '/health') {
            this.sendJson(res, 200, {
                status: 'ok',
                pid: process.pid,
                controlPort: this.controlPort,
                restServerPort: this.restServerPort,
            });
            return;
        }
        if (req.method === 'POST' && pathname === '/daemon/session/register') {
            const body = await this.parseBody(req);
            const session = this.sessionManager.getOrCreateSession(body.sessionId);
            this.sendJson(res, 200, {
                sessionId: session.id,
                createdAt: session.createdAt.toISOString(),
                workerCount: session.workers.size,
                projectId: session.projectId,
            });
            return;
        }
        if (req.method === 'POST' && pathname === '/daemon/tool-call') {
            const body = await this.parseBody(req);
            if (!body.sessionId || !body.toolName) {
                this.sendJson(res, 400, { error: 'Missing sessionId or toolName' });
                return;
            }
            const result = await this.callTool(body.sessionId, body.toolName, body.args || {});
            this.sendJson(res, 200, result);
            return;
        }
        this.sendJson(res, 404, { error: 'Not found' });
    }
    async parseBody(req) {
        const chunks = [];
        for await (const chunk of req) {
            chunks.push(chunk);
        }
        const body = Buffer.concat(chunks).toString('utf-8');
        return body ? JSON.parse(body) : {};
    }
    sendJson(res, status, data) {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
    }
    async callTool(sessionId, toolName, args) {
        const session = this.sessionManager.getOrCreateSession(sessionId);
        this.sessionManager.touchSession(sessionId);
        if (toolName === 'session_get_id') {
            return {
                content: [{
                        type: 'text',
                        text: JSON.stringify({
                            sessionId: session.id,
                            createdAt: session.createdAt.toISOString(),
                            workerCount: session.workers.size,
                            projectId: session.projectId,
                        }, null, 2),
                    }],
            };
        }
        if (toolName === 'session_list_all') {
            const stats = this.sessionManager.getStats();
            const sessions = this.sessionManager.listSessions().map(item => ({
                id: item.id,
                projectId: item.projectId,
                workerCount: item.workers.size,
                workers: Array.from(item.workers.values()).map(worker => ({
                    id: worker.id,
                    type: worker.type,
                    status: worker.status,
                    currentTaskId: worker.currentTaskId,
                    lastHeartbeat: worker.lastHeartbeat.toISOString(),
                })),
                lastActivity: item.lastActivity.toISOString(),
            }));
            return {
                content: [{
                        type: 'text',
                        text: JSON.stringify({ stats, sessions }, null, 2),
                    }],
            };
        }
        if (toolName === 'session_get_stats') {
            return {
                content: [{
                        type: 'text',
                        text: JSON.stringify(this.sessionManager.getStats(), null, 2),
                    }],
            };
        }
        const payload = { ...args };
        if ((toolName === 'worker_spawn_virtual' || toolName === 'session_export' || toolName === 'session_get_handover_prompt') && !payload.sessionId) {
            payload.sessionId = sessionId;
        }
        if (toolName === 'supervisor_start_project') {
            try {
                const binding = await this.bindingManager.createBinding(sessionId, '');
                logger.info('SupervisorDaemon', 'Session binding created for supervisor_start_project', {
                    mainSessionId: sessionId,
                    monitorSessionId: binding.monitorAgentSessionId,
                });
                await this.monitorService.startMonitoring(sessionId);
            }
            catch (error) {
                logger.error('SupervisorDaemon', 'Failed to initialize session binding', {
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }
        if (toolName === 'worker_heartbeat' && typeof payload.workerId === 'string') {
            this.sessionManager.updateWorkerHeartbeat(sessionId, payload.workerId);
        }
        if (toolName === 'task_report_progress' && typeof payload.taskId === 'string') {
            const activeWorker = Array.from(session.workers.values()).find(worker => worker.status !== 'terminated');
            if (activeWorker) {
                this.sessionManager.setWorkerTask(sessionId, activeWorker.id, payload.taskId);
            }
        }
        const result = await this.supervisor.handleToolCall(toolName, payload);
        if (toolName === 'supervisor_start_project' && !result.isError) {
            try {
                const parsed = JSON.parse(result.content[0]?.text || '{}');
                const projectId = parsed.project?.id || parsed.id;
                if (projectId) {
                    const binding = this.bindingManager.getBindingByMainSession(sessionId);
                    if (binding) {
                        binding.projectId = projectId;
                        await this.bindingManager.saveBinding(binding);
                    }
                    this.sessionManager.setProject(sessionId, projectId);
                }
            }
            catch {
                // ignore parse failures
            }
        }
        if (toolName === 'worker_spawn_virtual' && !result.isError) {
            try {
                const parsed = JSON.parse(result.content[0]?.text || '{}');
                if (parsed.workerId) {
                    this.sessionManager.addWorker(sessionId, parsed.workerId, 'virtual');
                    if (parsed.projectId) {
                        this.sessionManager.setProject(sessionId, parsed.projectId);
                    }
                }
            }
            catch {
                // ignore parse failures
            }
        }
        if (toolName === 'worker_spawn' && !result.isError) {
            try {
                const parsed = JSON.parse(result.content[0]?.text || '{}');
                const workerId = typeof parsed === 'string' ? parsed : parsed.workerId;
                if (workerId) {
                    this.sessionManager.addWorker(sessionId, workerId, 'process');
                    if (typeof payload.projectId === 'string') {
                        this.sessionManager.setProject(sessionId, payload.projectId);
                    }
                }
            }
            catch {
                // ignore parse failures
            }
        }
        if (toolName === 'task_assign' && !result.isError && typeof payload.workerId === 'string') {
            this.sessionManager.setWorkerTask(sessionId, payload.workerId, typeof payload.taskId === 'string' ? payload.taskId : undefined);
        }
        return result;
    }
}
export async function runSupervisorDaemon() {
    const daemon = new SupervisorDaemon();
    process.on('SIGINT', async () => {
        await daemon.stop();
        process.exit(0);
    });
    process.on('SIGTERM', async () => {
        await daemon.stop();
        process.exit(0);
    });
    await daemon.start();
}
//# sourceMappingURL=supervisor-daemon.js.map