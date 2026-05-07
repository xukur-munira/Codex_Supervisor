/**
 * WebSocket Broadcaster for Agent Visualizer
 * Pushes real-time messages to the web UI
 */
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';
export class AgentVisualizerServer {
    wss = null;
    server = null;
    clients = new Set();
    port = 3001; // Different from REST API port
    constructor(port = 3001) {
        this.port = port;
    }
    async start() {
        // Create HTTP server for serving the HTML
        this.server = http.createServer((req, res) => {
            if (req.url === '/' || req.url === '/visualizer') {
                const htmlPath = path.join(__dirname, 'agent-visualizer.html');
                fs.readFile(htmlPath, (err, data) => {
                    if (err) {
                        res.writeHead(500);
                        res.end('Failed to load visualizer');
                        return;
                    }
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end(data);
                });
            }
            else if (req.url === '/ws/agent-visualizer') {
                // WebSocket upgrade will be handled below
            }
            else {
                res.writeHead(404);
                res.end('Not found');
            }
        });
        // Create WebSocket server
        this.wss = new WebSocketServer({ server: this.server, path: '/ws/agent-visualizer' });
        this.wss.on('connection', (ws, req) => {
            this.clients.add(ws);
            logger.info('AgentVisualizer', 'Client connected', { clients: this.clients.size });
            // Send initial connection message
            this.sendToClient(ws, {
                type: 'info',
                source: 'supervisor',
                timestamp: new Date().toISOString(),
                content: { message: '已连接到 Supervisor 可视化界面' },
            });
            ws.on('close', () => {
                this.clients.delete(ws);
                logger.info('AgentVisualizer', 'Client disconnected', { clients: this.clients.size });
            });
            ws.on('error', (err) => {
                logger.error('AgentVisualizer', 'WebSocket error', { error: err.message });
                this.clients.delete(ws);
            });
        });
        this.server.listen(this.port, () => {
            logger.info('AgentVisualizer', `Visualizer server started on http://localhost:${this.port}`);
        });
    }
    async stop() {
        if (this.wss) {
            for (const client of this.clients) {
                client.close();
            }
            this.wss.close();
        }
        if (this.server) {
            this.server.close();
        }
        logger.info('AgentVisualizer', 'Visualizer server stopped');
    }
    /** Broadcast message to all connected clients */
    broadcast(message) {
        if (this.clients.size === 0) {
            return; // No clients connected
        }
        const data = JSON.stringify(message);
        for (const client of this.clients) {
            if (client.readyState === WebSocket.OPEN) {
                client.send(data);
            }
        }
        logger.debug('AgentVisualizer', 'Broadcasted message', {
            type: message.type,
            source: message.source,
            clients: this.clients.size,
        });
    }
    /** Send to specific client */
    sendToClient(ws, message) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(message));
        }
    }
    /** Helper: Broadcast tool call from worker */
    broadcastWorkerToolCall(tool, args) {
        this.broadcast({
            type: 'tool-call',
            source: 'worker',
            timestamp: new Date().toISOString(),
            content: { tool, args },
        });
    }
    /** Helper: Broadcast tool result to worker */
    broadcastSupervisorToolResult(tool, result, error) {
        this.broadcast({
            type: 'tool-result',
            source: 'supervisor',
            timestamp: new Date().toISOString(),
            content: { tool, result, error },
        });
    }
    /** Helper: Broadcast status update */
    broadcastStatus(data) {
        this.broadcast({
            type: 'status',
            source: 'supervisor',
            timestamp: new Date().toISOString(),
            content: data,
        });
    }
    /** Helper: Broadcast progress update */
    broadcastProgress(taskSubject, status, progress) {
        this.broadcast({
            type: 'progress',
            source: 'worker',
            timestamp: new Date().toISOString(),
            content: { taskSubject, status, progress },
        });
    }
    /** Helper: Broadcast error */
    broadcastError(message, source = 'supervisor') {
        this.broadcast({
            type: 'error',
            source,
            timestamp: new Date().toISOString(),
            content: { message },
        });
    }
    /** Helper: Broadcast heartbeat */
    broadcastHeartbeat(workerId) {
        this.broadcast({
            type: 'heartbeat',
            source: 'worker',
            timestamp: new Date().toISOString(),
            content: { workerId },
        });
    }
    /** Get client count */
    getClientCount() {
        return this.clients.size;
    }
    /** Check if any clients are connected */
    hasClients() {
        return this.clients.size > 0;
    }
}
// Singleton instance
let visualizerServer = null;
export function getVisualizerServer(port = 3001) {
    if (!visualizerServer) {
        visualizerServer = new AgentVisualizerServer(port);
    }
    return visualizerServer;
}
//# sourceMappingURL=websocket-broadcaster.js.map