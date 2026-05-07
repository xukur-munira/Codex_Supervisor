/**
 * REST API Server for Codex Supervisor
 * Provides HTTP endpoints for managing projects, tasks, and workers
 */
import { createServer } from 'http';
import { parse } from 'url';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import fs from 'fs';
import path from 'path';
import { Supervisor } from '../core/supervisor.js';
import { createMessageQueue } from '../messaging/queue.js';
import { MessageLog } from '../persistence/message-log.js';
import { logger } from '../utils/logger.js';
import { CodexSessionReader } from '../codex/codex-session-reader.js';
import { SessionBindingManager } from '../core/session-binding.js';
export class RestApiServer {
    static visualizerOpened = false;
    supervisor;
    server = null;
    wss = null;
    wsClients = new Set();
    port;
    codexReader;
    bindingManager;
    constructor(port = 3000) {
        this.port = port;
        // Initialize supervisor with in-memory queue by default
        const messageQueue = createMessageQueue();
        this.supervisor = new Supervisor(messageQueue);
        this.bindingManager = new SessionBindingManager();
        this.codexReader = new CodexSessionReader();
    }
    routes = [
        // Project endpoints
        {
            method: 'POST',
            path: '/api/projects',
            handler: this.handleCreateProject.bind(this),
        },
        {
            method: 'GET',
            path: '/api/projects',
            handler: this.handleListProjects.bind(this),
        },
        {
            method: 'GET',
            path: '/api/projects/:projectId',
            handler: this.handleGetProject.bind(this),
        },
        // Task endpoints
        {
            method: 'POST',
            path: '/api/projects/:projectId/tasks',
            handler: this.handleDecomposeTasks.bind(this),
        },
        {
            method: 'GET',
            path: '/api/projects/:projectId/tasks',
            handler: this.handleListTasks.bind(this),
        },
        {
            method: 'GET',
            path: '/api/projects/:projectId/tasks/:taskId',
            handler: this.handleGetTask.bind(this),
        },
        {
            method: 'POST',
            path: '/api/projects/:projectId/tasks/:taskId/assign',
            handler: this.handleAssignTask.bind(this),
        },
        // Worker endpoints
        {
            method: 'POST',
            path: '/api/projects/:projectId/workers',
            handler: this.handleSpawnWorker.bind(this),
        },
        {
            method: 'GET',
            path: '/api/projects/:projectId/workers',
            handler: this.handleListWorkers.bind(this),
        },
        {
            method: 'DELETE',
            path: '/api/workers/:workerId',
            handler: this.handleTerminateWorker.bind(this),
        },
        // Checkpoint endpoints
        {
            method: 'GET',
            path: '/api/projects/:projectId/checkpoints',
            handler: this.handleListCheckpoints.bind(this),
        },
        {
            method: 'POST',
            path: '/api/projects/:projectId/checkpoints/:checkpointId/review',
            handler: this.handleReviewCheckpoint.bind(this),
        },
        // Completion endpoints
        {
            method: 'GET',
            path: '/api/projects/:projectId/completion',
            handler: this.handleCheckCompletion.bind(this),
        },
        {
            method: 'POST',
            path: '/api/projects/:projectId/confirm',
            handler: this.handleConfirmSupervisor.bind(this),
        },
        {
            method: 'POST',
            path: '/api/projects/:projectId/finalize',
            handler: this.handleFinalize.bind(this),
        },
        // Health check
        {
            method: 'GET',
            path: '/health',
            handler: this.handleHealth.bind(this),
        },
        // Broadcast endpoint for MCP SDK clients
        {
            method: 'POST',
            path: '/api/broadcast',
            handler: this.handleBroadcast.bind(this),
        },
        // Messages endpoint for history
        {
            method: 'GET',
            path: '/api/projects/:projectId/messages',
            handler: this.handleGetMessages.bind(this),
        },
        // Session binding endpoints
        {
            method: 'GET',
            path: '/api/bindings/:sessionId',
            handler: this.handleGetBinding.bind(this),
        },
        {
            method: 'GET',
            path: '/api/bindings',
            handler: this.handleListBindings.bind(this),
        },
        // Codex session endpoints
        {
            method: 'GET',
            path: '/api/codex/sessions',
            handler: this.handleListCodexSessions.bind(this),
        },
        {
            method: 'GET',
            path: '/api/codex/sessions/:sessionId/messages',
            handler: this.handleGetCodexSessionMessages.bind(this),
        },
    ];
    async start() {
        await this.supervisor.init();
        this.server = createServer(async (req, res) => {
            // Serve visualizer HTML
            const parsedUrl = parse(req.url || '', true);
            if (parsedUrl.pathname === '/visualizer' || parsedUrl.pathname === '/') {
                const __filename = fileURLToPath(import.meta.url);
                const __dirname = path.dirname(__filename);
                const htmlPath = path.join(__dirname, '../web/agent-visualizer.html');
                fs.readFile(htmlPath, (err, data) => {
                    if (err) {
                        res.writeHead(500);
                        res.end('Failed to load visualizer');
                        return;
                    }
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end(data);
                });
                return;
            }
            await this.handleRequest(req, res);
        });
        // WebSocket server for real-time updates
        this.wss = new WebSocketServer({ server: this.server, path: '/ws/visualizer' });
        this.wss.on('error', (err) => {
            logger.error('RestApiServer', 'WebSocket server error', { error: err.message });
        });
        this.wss.on('connection', (ws) => {
            this.wsClients.add(ws);
            logger.info('RestApiServer', 'Visualizer client connected', { clients: this.wsClients.size });
            // Send initial status
            this.sendToWsClient(ws, {
                type: 'status',
                source: 'supervisor',
                timestamp: new Date().toISOString(),
                content: { message: '已连接到 Supervisor 可视化界面' },
            });
            ws.on('close', () => {
                this.wsClients.delete(ws);
                logger.info('RestApiServer', 'Visualizer client disconnected', { clients: this.wsClients.size });
            });
            ws.on('error', (err) => {
                logger.error('RestApiServer', 'WebSocket error', { error: err.message });
                this.wsClients.delete(ws);
            });
        });
        await new Promise((resolve, reject) => {
            if (!this.server) {
                reject(new Error('HTTP server is not initialized'));
                return;
            }
            const onError = (error) => {
                this.server?.off('listening', onListening);
                reject(error);
            };
            const onListening = () => {
                this.server?.off('error', onError);
                resolve();
            };
            this.server.once('error', onError);
            this.server.once('listening', onListening);
            this.server.listen(this.port);
        });
        this.port = this.getPort();
        logger.info('RestApiServer', `Server started on port ${this.port}`, {
            apiUrl: `http://localhost:${this.port}`,
            visualizerUrl: `http://localhost:${this.port}/visualizer`,
        });
        // Graceful shutdown
        process.on('SIGINT', async () => {
            await this.stop();
            process.exit(0);
        });
        process.on('SIGTERM', async () => {
            await this.stop();
            process.exit(0);
        });
    }
    async stop() {
        // Close WebSocket connections
        if (this.wss) {
            for (const client of this.wsClients) {
                client.close();
            }
            this.wss.close();
        }
        if (this.server) {
            this.server.close();
        }
        await this.supervisor.cleanup();
        logger.info('RestApiServer', 'Server stopped');
    }
    getPort() {
        if (!this.server) {
            return this.port;
        }
        const address = this.server.address();
        if (address && typeof address !== 'string') {
            return address.port;
        }
        return this.port;
    }
    /** WebSocket helpers */
    sendToWsClient(ws, message) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(message));
        }
    }
    /** Broadcast to all WebSocket clients */
    broadcastToVisualizer(message) {
        if (this.wsClients.size === 0)
            return;
        const data = JSON.stringify(message);
        for (const client of this.wsClients) {
            if (client.readyState === WebSocket.OPEN) {
                client.send(data);
            }
        }
        logger.debug('RestApiServer', 'Broadcasted to visualizer', { type: message.type, clients: this.wsClients.size });
    }
    /** Check if visualizer has clients */
    hasVisualizerClients() {
        return this.wsClients.size > 0;
    }
    /** Global visualizer opened state to prevent infinite popups */
    static isVisualizerOpened() {
        return RestApiServer.visualizerOpened;
    }
    static setVisualizerOpened(opened) {
        RestApiServer.visualizerOpened = opened;
    }
    async handleRequest(req, res) {
        const parsedUrl = parse(req.url || '', true);
        const pathname = parsedUrl.pathname || '';
        const method = req.method || 'GET';
        // Parse body for POST/PUT requests
        let body = null;
        if (method === 'POST' || method === 'PUT') {
            body = await this.parseBody(req);
        }
        // Find matching route
        for (const route of this.routes) {
            if (route.method !== method)
                continue;
            const match = this.matchPath(route.path, pathname);
            if (match) {
                try {
                    const mergedBody = { ...(body || {}), ...match.params, ...(parsedUrl.query || {}) };
                    await route.handler(req, res, mergedBody);
                    return;
                }
                catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    logger.error('RestApiServer', 'Route handler error', { error: errorMessage });
                    this.sendJson(res, 500, { error: errorMessage });
                    return;
                }
            }
        }
        // No route found
        this.sendJson(res, 404, { error: 'Not found' });
    }
    matchPath(pattern, pathname) {
        const patternParts = pattern.split('/');
        const pathParts = pathname.split('/');
        if (patternParts.length !== pathParts.length) {
            return null;
        }
        const params = {};
        for (let i = 0; i < patternParts.length; i++) {
            const patternPart = patternParts[i];
            const pathPart = pathParts[i];
            if (patternPart.startsWith(':')) {
                params[patternPart.slice(1)] = pathPart;
            }
            else if (patternPart !== pathPart) {
                return null;
            }
        }
        return { params };
    }
    async parseBody(req) {
        const chunks = [];
        for await (const chunk of req) {
            chunks.push(chunk);
        }
        const bodyStr = Buffer.concat(chunks).toString();
        if (!bodyStr)
            return null;
        try {
            return JSON.parse(bodyStr);
        }
        catch {
            return bodyStr;
        }
    }
    sendJson(res, status, data) {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data, null, 2));
    }
    // Route handlers
    async handleCreateProject(req, res, body) {
        const data = body;
        if (!data?.name || !data?.description || !data?.workingDirectory) {
            this.sendJson(res, 400, { error: 'Missing required fields: name, description, workingDirectory' });
            return;
        }
        const project = await this.supervisor.startProject(data.name, data.description, data.workingDirectory);
        this.sendJson(res, 201, project);
    }
    async handleListProjects(req, res) {
        const projects = await this.supervisor.listProjects();
        this.sendJson(res, 200, projects);
    }
    async handleGetProject(req, res, body) {
        const data = body;
        const project = await this.supervisor.getProjectStatus(data?.projectId || '');
        if (!project) {
            this.sendJson(res, 404, { error: 'Project not found' });
            return;
        }
        this.sendJson(res, 200, project);
    }
    async handleDecomposeTasks(req, res, body) {
        const data = body;
        if (!data?.projectId || !data?.tasks) {
            this.sendJson(res, 400, { error: 'Missing required fields: projectId, tasks' });
            return;
        }
        const tasks = await this.supervisor.decomposeTasks(data.projectId, data.tasks);
        this.sendJson(res, 201, tasks);
    }
    async handleListTasks(req, res, body) {
        const data = body;
        const tasks = await this.supervisor.listTasks(data?.projectId || '');
        this.sendJson(res, 200, tasks);
    }
    async handleGetTask(req, res, body) {
        const data = body;
        const task = await this.supervisor.getTask(data?.projectId || '', data?.taskId || '');
        if (!task) {
            this.sendJson(res, 404, { error: 'Task not found' });
            return;
        }
        this.sendJson(res, 200, task);
    }
    async handleAssignTask(req, res, body) {
        const data = body;
        if (!data?.projectId || !data?.taskId || !data?.workerId) {
            this.sendJson(res, 400, { error: 'Missing required fields: projectId, taskId, workerId' });
            return;
        }
        const task = await this.supervisor.assignTask(data.projectId, data.taskId, data.workerId);
        this.sendJson(res, 200, task);
    }
    async handleSpawnWorker(req, res, body) {
        const data = body;
        if (!data?.projectId) {
            this.sendJson(res, 400, { error: 'Missing required field: projectId' });
            return;
        }
        const workerId = await this.supervisor.spawnWorker(data.projectId, { systemPrompt: data.systemPrompt });
        this.sendJson(res, 201, { workerId });
    }
    async handleListWorkers(req, res, body) {
        const data = body;
        const workers = await this.supervisor.listWorkers(data?.projectId || '');
        this.sendJson(res, 200, workers);
    }
    async handleTerminateWorker(req, res, body) {
        const data = body;
        if (!data?.workerId) {
            this.sendJson(res, 400, { error: 'Missing required field: workerId' });
            return;
        }
        const success = this.supervisor.terminateWorker(data.workerId, data.graceful ?? true);
        this.sendJson(res, 200, { success });
    }
    async handleListCheckpoints(req, res, body) {
        const data = body;
        const checkpoints = await this.supervisor.getPendingCheckpoints(data?.projectId || '');
        this.sendJson(res, 200, checkpoints);
    }
    async handleReviewCheckpoint(req, res, body) {
        const data = body;
        if (!data?.projectId || !data?.checkpointId || data?.approved === undefined) {
            this.sendJson(res, 400, { error: 'Missing required fields: projectId, checkpointId, approved' });
            return;
        }
        const checkpoint = await this.supervisor.reviewCheckpoint(data.projectId, data.checkpointId, data.approved, data.feedback);
        this.sendJson(res, 200, checkpoint);
    }
    async handleCheckCompletion(req, res, body) {
        const data = body;
        const result = await this.supervisor.checkCompletion(data?.projectId || '');
        this.sendJson(res, 200, result);
    }
    async handleConfirmSupervisor(req, res, body) {
        const data = body;
        const project = await this.supervisor.confirmSupervisor(data?.projectId || '');
        this.sendJson(res, 200, project);
    }
    async handleFinalize(req, res, body) {
        const data = body;
        await this.supervisor.finalizeProject(data?.projectId || '');
        this.sendJson(res, 200, { success: true });
    }
    async handleHealth(req, res) {
        this.sendJson(res, 200, { status: 'ok', timestamp: new Date().toISOString() });
    }
    async handleBroadcast(req, res, body) {
        const message = body;
        if (!message?.type || !message?.source) {
            this.sendJson(res, 400, { error: 'Missing required fields: type, source' });
            return;
        }
        // Persist message to disk if projectId is provided
        if (message.content?.projectId) {
            try {
                const projectId = message.content.projectId;
                const sessionId = message.content.sessionId || 'unknown';
                const messageLog = new MessageLog(projectId);
                // Create a properly formatted message with all required fields
                const fullMessage = {
                    id: `${message.type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    timestamp: message.timestamp || new Date().toISOString(),
                    projectId: projectId,
                    sessionId: sessionId,
                    type: message.type,
                    source: message.source,
                    content: message.content
                };
                await messageLog.append(fullMessage);
                logger.info('RestApiServer', 'Message persisted', {
                    projectId: projectId,
                    type: message.type,
                    sessionId: sessionId
                });
            }
            catch (err) {
                logger.error('RestApiServer', 'Failed to persist message', { error: String(err) });
            }
        }
        // Broadcast to all WebSocket visualizer clients
        this.broadcastToVisualizer(message);
        this.sendJson(res, 200, { broadcasted: true, clients: this.wsClients.size });
    }
    async handleGetMessages(req, res, body) {
        const parsedUrl = parse(req.url || '', true);
        const pathParts = parsedUrl.pathname?.split('/') || [];
        const projectId = pathParts[3];
        if (!projectId) {
            this.sendJson(res, 400, { error: 'Missing projectId' });
            return;
        }
        try {
            const messageLog = new MessageLog(projectId);
            const messages = await messageLog.readAll();
            // Optional query parameters for filtering
            const sessionId = parsedUrl.query.sessionId;
            const since = parsedUrl.query.since;
            let filteredMessages = messages;
            if (sessionId) {
                filteredMessages = filteredMessages.filter(msg => msg.sessionId === sessionId);
            }
            if (since) {
                filteredMessages = filteredMessages.filter(msg => new Date(msg.timestamp).getTime() >= new Date(since).getTime());
            }
            this.sendJson(res, 200, { messages: filteredMessages, count: filteredMessages.length });
        }
        catch (error) {
            logger.error('RestApiServer', 'Failed to get messages', { error: String(error) });
            this.sendJson(res, 500, { error: 'Failed to read message log' });
        }
    }
    // Session binding handlers
    async handleGetBinding(req, res, body) {
        const parsedUrl = parse(req.url || '', true);
        const pathParts = parsedUrl.pathname?.split('/') || [];
        const sessionId = pathParts[3];
        if (!sessionId) {
            this.sendJson(res, 400, { error: 'Missing sessionId' });
            return;
        }
        try {
            const binding = this.bindingManager.getBindingByMainSession(sessionId);
            if (binding) {
                this.sendJson(res, 200, binding);
            }
            else {
                this.sendJson(res, 404, { error: 'Session binding not found' });
            }
        }
        catch (error) {
            logger.error('RestApiServer', 'Failed to get binding', { error: String(error) });
            this.sendJson(res, 500, { error: 'Failed to get session binding' });
        }
    }
    async handleListBindings(req, res, body) {
        try {
            const bindings = this.bindingManager.listActiveBindings();
            this.sendJson(res, 200, { bindings, count: bindings.length });
        }
        catch (error) {
            logger.error('RestApiServer', 'Failed to list bindings', { error: String(error) });
            this.sendJson(res, 500, { error: 'Failed to list session bindings' });
        }
    }
    // Codex session handlers
    async handleListCodexSessions(req, res, body) {
        try {
            const files = await this.codexReader.getSessionFiles(50);
            const sessions = files.map(file => {
                const parts = file.split('/');
                const filename = parts[parts.length - 1] || 'unknown';
                return {
                    file,
                    filename,
                    timestamp: filename.split('-')[0] || ''
                };
            });
            this.sendJson(res, 200, { sessions, count: sessions.length });
        }
        catch (error) {
            logger.error('RestApiServer', 'Failed to list Codex sessions', { error: String(error) });
            this.sendJson(res, 500, { error: 'Failed to list Codex sessions' });
        }
    }
    async handleGetCodexSessionMessages(req, res, body) {
        const parsedUrl = parse(req.url || '', true);
        const pathParts = parsedUrl.pathname?.split('/') || [];
        const sessionId = pathParts[4];
        if (!sessionId) {
            this.sendJson(res, 400, { error: 'Missing sessionId' });
            return;
        }
        try {
            const messages = await this.codexReader.getSessionById(sessionId);
            this.sendJson(res, 200, { messages, count: messages.length });
        }
        catch (error) {
            logger.error('RestApiServer', 'Failed to get Codex session messages', { error: String(error) });
            this.sendJson(res, 500, { error: 'Failed to read Codex session' });
        }
    }
}
//# sourceMappingURL=rest-server.js.map