/**
 * MCP Server Implementation for Codex Supervisor
 * Implements JSON-RPC 2.0 protocol over stdio for MCP compatibility
 */
import { Supervisor } from '../core/supervisor.js';
import { createMessageQueue } from '../messaging/queue.js';
import { logger } from '../utils/logger.js';
import { RestApiServer } from '../api/rest-server.js';
function isAddressInUse(error) {
    return error instanceof Error && 'code' in error && error.code === 'EADDRINUSE';
}
const TOOLS = [
    {
        name: 'supervisor_start_project',
        description: 'Create a new supervised project for Codex CLI workers',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Project name' },
                description: { type: 'string', description: 'Project description/goal' },
                workingDirectory: { type: 'string', description: 'Working directory path (must exist)' },
            },
            required: ['name', 'description', 'workingDirectory'],
        },
    },
    {
        name: 'supervisor_get_status',
        description: 'Get project status by ID',
        inputSchema: {
            type: 'object',
            properties: {
                projectId: { type: 'string', description: 'Project UUID' },
            },
            required: ['projectId'],
        },
    },
    {
        name: 'supervisor_list_projects',
        description: 'List all projects',
        inputSchema: {
            type: 'object',
            properties: {},
        },
    },
    {
        name: 'task_decompose',
        description: 'Decompose project into tasks',
        inputSchema: {
            type: 'object',
            properties: {
                projectId: { type: 'string', description: 'Project UUID' },
                tasks: { type: 'array', description: 'Array of task definitions with subject, description, priority, blockedBy' },
            },
            required: ['projectId', 'tasks'],
        },
    },
    {
        name: 'task_list',
        description: 'List all tasks for a project',
        inputSchema: {
            type: 'object',
            properties: {
                projectId: { type: 'string', description: 'Project UUID' },
            },
            required: ['projectId'],
        },
    },
    {
        name: 'task_get',
        description: 'Get specific task details',
        inputSchema: {
            type: 'object',
            properties: {
                projectId: { type: 'string', description: 'Project UUID' },
                taskId: { type: 'string', description: 'Task UUID' },
            },
            required: ['projectId', 'taskId'],
        },
    },
    {
        name: 'task_assign',
        description: 'Assign task to a worker',
        inputSchema: {
            type: 'object',
            properties: {
                projectId: { type: 'string', description: 'Project UUID' },
                taskId: { type: 'string', description: 'Task UUID' },
                workerId: { type: 'string', description: 'Worker UUID' },
            },
            required: ['projectId', 'taskId', 'workerId'],
        },
    },
    {
        name: 'worker_spawn',
        description: 'Spawn a new Codex CLI worker subprocess (separate session)',
        inputSchema: {
            type: 'object',
            properties: {
                projectId: { type: 'string', description: 'Project UUID' },
                systemPrompt: { type: 'string', description: 'Optional system prompt for worker' },
            },
            required: ['projectId'],
        },
    },
    {
        name: 'worker_spawn_virtual',
        description: 'Spawn a virtual worker for SESSION BINDING MODE - monitors current session, no subprocess. Use this to supervise the current AI session instead of spawning a new one.',
        inputSchema: {
            type: 'object',
            properties: {
                projectId: { type: 'string', description: 'Project UUID' },
            },
            required: ['projectId'],
        },
    },
    {
        name: 'worker_heartbeat',
        description: 'Refresh heartbeat for virtual worker - call periodically to show you are still working',
        inputSchema: {
            type: 'object',
            properties: {
                workerId: { type: 'string', description: 'Worker UUID (virtual worker)' },
            },
            required: ['workerId'],
        },
    },
    {
        name: 'task_report_progress',
        description: 'Report task progress from current session (for session binding mode). Use this to tell the supervisor what task you are working on and its status.',
        inputSchema: {
            type: 'object',
            properties: {
                projectId: { type: 'string', description: 'Project UUID' },
                taskId: { type: 'string', description: 'Task UUID' },
                status: { type: 'string', description: 'Status: started, in_progress, blocked, completed, failed' },
                summary: { type: 'string', description: 'Optional progress summary' },
            },
            required: ['projectId', 'taskId', 'status'],
        },
    },
    {
        name: 'worker_list',
        description: 'List all workers for a project',
        inputSchema: {
            type: 'object',
            properties: {
                projectId: { type: 'string', description: 'Project UUID' },
            },
            required: ['projectId'],
        },
    },
    {
        name: 'worker_terminate',
        description: 'Terminate a worker',
        inputSchema: {
            type: 'object',
            properties: {
                workerId: { type: 'string', description: 'Worker UUID' },
                graceful: { type: 'boolean', description: 'Graceful shutdown (default true)' },
            },
            required: ['workerId'],
        },
    },
    {
        name: 'checkpoint_list',
        description: 'List pending checkpoints for review',
        inputSchema: {
            type: 'object',
            properties: {
                projectId: { type: 'string', description: 'Project UUID' },
            },
            required: ['projectId'],
        },
    },
    {
        name: 'checkpoint_review',
        description: 'Review a checkpoint (approve or reject)',
        inputSchema: {
            type: 'object',
            properties: {
                projectId: { type: 'string', description: 'Project UUID' },
                checkpointId: { type: 'string', description: 'Checkpoint UUID' },
                approved: { type: 'boolean', description: 'Approve or reject' },
                feedback: { type: 'string', description: 'Optional feedback message' },
            },
            required: ['projectId', 'checkpointId', 'approved'],
        },
    },
    {
        name: 'project_check_completion',
        description: 'Check if project meets completion criteria',
        inputSchema: {
            type: 'object',
            properties: {
                projectId: { type: 'string', description: 'Project UUID' },
            },
            required: ['projectId'],
        },
    },
    {
        name: 'project_confirm_supervisor',
        description: 'Supervisor confirmation of project completion',
        inputSchema: {
            type: 'object',
            properties: {
                projectId: { type: 'string', description: 'Project UUID' },
            },
            required: ['projectId'],
        },
    },
    {
        name: 'project_finalize',
        description: 'Finalize and archive project',
        inputSchema: {
            type: 'object',
            properties: {
                projectId: { type: 'string', description: 'Project UUID' },
            },
            required: ['projectId'],
        },
    },
    {
        name: 'supervisor_get_guidance',
        description: 'Get guidance for what to do next (for session binding mode). Returns current task, next task, progress, and a helpful message.',
        inputSchema: {
            type: 'object',
            properties: {
                projectId: { type: 'string', description: 'Project UUID' },
            },
            required: ['projectId'],
        },
    },
    {
        name: 'session_export',
        description: 'Export session for handover to new session (when context exhausted). Creates markdown file with all work history, key decisions, and pending tasks. Use this to transfer work to a new session.',
        inputSchema: {
            type: 'object',
            properties: {
                projectId: { type: 'string', description: 'Project UUID' },
                sessionId: { type: 'string', description: 'Current virtual worker/session ID' },
                includeHandoverPrompt: { type: 'boolean', description: 'Generate handover prompt for new session (default: true)' },
            },
            required: ['projectId', 'sessionId'],
        },
    },
    {
        name: 'session_get_handover_prompt',
        description: 'Get handover prompt for new session. This is a ready-to-use prompt that you can paste into a new Codex session to continue the work.',
        inputSchema: {
            type: 'object',
            properties: {
                projectId: { type: 'string', description: 'Project UUID' },
                sessionId: { type: 'string', description: 'Current virtual worker/session ID' },
            },
            required: ['projectId', 'sessionId'],
        },
    },
];
export class McpServer {
    supervisor;
    restServer = null;
    restServerPort = 3000;
    constructor() {
        const messageQueue = createMessageQueue();
        this.supervisor = new Supervisor(messageQueue);
        this.restServerPort = parseInt(process.env.CODEX_PORT || '3000', 10);
    }
    async start() {
        // Initialize supervisor
        await this.supervisor.init();
        logger.info('McpServer', 'MCP server initialized');
        // Start REST API server in background
        await this.startRestServerBackground();
        // Start MCP protocol over stdio
        this.runMcpProtocol();
    }
    async startRestServerBackground() {
        // Try to check if REST server is already running
        if (this.restServerPort > 0) {
            try {
                const response = await fetch(`http://localhost:${this.restServerPort}/health`);
                if (response.ok) {
                    logger.info('McpServer', `REST API server already running on port ${this.restServerPort}`);
                    return;
                }
            }
            catch {
                // Server not running, need to start it
            }
        }
        try {
            this.restServer = new RestApiServer(this.restServerPort);
            await this.restServer.start();
            this.restServerPort = this.restServer.getPort();
            logger.info('McpServer', `REST API server started on port ${this.restServerPort}`);
            return;
        }
        catch (error) {
            if (!isAddressInUse(error)) {
                throw error;
            }
            logger.warn('McpServer', 'Configured REST API port is occupied by another process; using a fallback port for the visualizer', {
                requestedPort: this.restServerPort,
            });
        }
        this.restServer = new RestApiServer(0);
        await this.restServer.start();
        this.restServerPort = this.restServer.getPort();
        logger.info('McpServer', `REST API server started on fallback port ${this.restServerPort}`);
    }
    runMcpProtocol() {
        // MCP uses stdio for communication
        // stdin for requests, stdout for responses
        // stderr for logs (already handled by logger)
        let buffer = '';
        process.stdin.on('data', (chunk) => {
            buffer += chunk.toString();
            // Process complete JSON messages (newline-delimited)
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep incomplete line in buffer
            for (const line of lines) {
                if (line.trim()) {
                    this.handleMessage(line.trim());
                }
            }
        });
        process.stdin.on('end', () => {
            logger.info('McpServer', 'MCP server stdin ended');
            this.cleanup();
        });
    }
    async handleMessage(line) {
        try {
            const request = JSON.parse(line);
            const response = await this.processRequest(request);
            this.sendResponse(response);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error('McpServer', 'Failed to parse request', { error: errorMessage, line });
            this.sendResponse({
                jsonrpc: '2.0',
                error: { code: -32700, message: 'Parse error' },
            });
        }
    }
    async processRequest(request) {
        const { method, params, id } = request;
        try {
            let result;
            switch (method) {
                case 'initialize':
                    result = this.handleInitialize(params);
                    break;
                case 'tools/list':
                    result = { tools: TOOLS };
                    break;
                case 'tools/call':
                    result = await this.handleToolCall(params);
                    break;
                case 'resources/list':
                    result = { resources: [] };
                    break;
                case 'prompts/list':
                    result = { prompts: [] };
                    break;
                case 'ping':
                    result = {};
                    break;
                default:
                    return {
                        jsonrpc: '2.0',
                        id,
                        error: { code: -32601, message: `Method not found: ${method}` },
                    };
            }
            return { jsonrpc: '2.0', id, result };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error('McpServer', 'Request processing error', { method, error: errorMessage });
            return {
                jsonrpc: '2.0',
                id,
                error: { code: -32603, message: 'Internal error', data: errorMessage },
            };
        }
    }
    handleInitialize(params) {
        const clientInfo = params?.clientInfo;
        logger.info('McpServer', 'MCP client initialized', { client: clientInfo?.name });
        return {
            protocolVersion: '2024-11-05',
            capabilities: {
                tools: {},
                resources: {},
                prompts: {},
            },
            serverInfo: {
                name: 'codex-supervisor',
                version: '1.0.0',
            },
        };
    }
    async handleToolCall(params) {
        if (!params?.name) {
            throw new Error('Missing tool name');
        }
        const toolName = params.name;
        const toolArgs = params.arguments || {};
        logger.info('McpServer', 'Tool call', { tool: toolName, args: toolArgs });
        const result = await this.supervisor.handleToolCall(toolName, toolArgs);
        return {
            content: result.content,
            isError: result.isError,
        };
    }
    sendResponse(response) {
        // Write to stdout (MCP protocol)
        process.stdout.write(JSON.stringify(response) + '\n');
    }
    async cleanup() {
        if (this.restServer) {
            await this.restServer.stop();
        }
        await this.supervisor.cleanup();
        logger.info('McpServer', 'MCP server cleaned up');
    }
}
//# sourceMappingURL=mcp-server.js.map