/**
 * MCP Server implementation for Codex Supervisor
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, ListResourcesRequestSchema, ReadResourceRequestSchema, } from '@modelcontextprotocol/sdk/types.js';
import { tools } from './tools/index.js';
import { resources } from './resources/index.js';
import { Supervisor } from '../core/supervisor.js';
import { createMessageQueue } from '../messaging/queue.js';
import { logger } from '../utils/logger.js';
export async function createAndRunServer() {
    const server = new Server({ name: 'codex-supervisor-mcp', version: '1.0.0' }, { capabilities: { tools: {}, resources: {} } });
    // Initialize core components
    const messageQueue = createMessageQueue();
    await messageQueue.connect();
    const supervisor = new Supervisor(messageQueue);
    // Graceful shutdown
    const cleanup = async () => {
        logger.info('McpServer', 'Shutting down...');
        await supervisor.cleanup();
        await messageQueue.disconnect();
    };
    process.on('SIGINT', async () => {
        await cleanup();
        process.exit(0);
    });
    process.on('SIGTERM', async () => {
        await cleanup();
        process.exit(0);
    });
    // Register tool handlers
    server.setRequestHandler(ListToolsRequestSchema, async () => {
        return { tools };
    });
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const toolName = request.params.name;
        const args = request.params.arguments || {};
        logger.info('McpServer', 'Tool called', { toolName, args });
        return supervisor.handleToolCall(toolName, args);
    });
    // Register resource handlers
    server.setRequestHandler(ListResourcesRequestSchema, async () => {
        return { resources };
    });
    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
        const uri = request.params.uri;
        if (uri === 'codex://projects') {
            const projects = await supervisor.listProjects();
            return {
                contents: [{
                        uri,
                        mimeType: 'application/json',
                        text: JSON.stringify(projects, null, 2),
                    }],
            };
        }
        // Handle URI templates
        const projectMatch = uri.match(/^codex:\/\/projects\/([^/]+)$/);
        if (projectMatch && projectMatch[1]) {
            const projectId = projectMatch[1];
            const project = await supervisor.getProjectStatus(projectId);
            return {
                contents: [{
                        uri,
                        mimeType: 'application/json',
                        text: JSON.stringify(project, null, 2),
                    }],
            };
        }
        const tasksMatch = uri.match(/^codex:\/\/projects\/([^/]+)\/tasks$/);
        if (tasksMatch && tasksMatch[1]) {
            const projectId = tasksMatch[1];
            const tasks = await supervisor.listTasks(projectId);
            return {
                contents: [{
                        uri,
                        mimeType: 'application/json',
                        text: JSON.stringify(tasks, null, 2),
                    }],
            };
        }
        return {
            contents: [{
                    uri,
                    mimeType: 'application/json',
                    text: JSON.stringify({ error: 'Resource not found' }),
                }],
        };
    });
    // Connect transport
    const transport = new StdioServerTransport();
    await server.connect(transport);
    logger.info('McpServer', 'Codex Supervisor MCP Server running');
}
//# sourceMappingURL=mcp-server.js.map