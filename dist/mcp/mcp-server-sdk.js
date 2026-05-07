/**
 * MCP stdio bridge.
 *
 * The old implementation owned the supervisor runtime inside the stdio child
 * process. Once Codex/Desktop closed stdin or sent SIGTERM, the same process
 * cleaned up every worker. This bridge now proxies tool calls to a detached
 * daemon so worker execution no longer depends on a single stdio process.
 */
import { randomUUID } from 'crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { DaemonClient } from '../daemon/daemon-client.js';
import { logger } from '../utils/logger.js';
export class McpServerSdk {
    mcpServer;
    daemonClient = new DaemonClient();
    sessionId = process.env.CODEX_SESSION_ID || process.env.CLAUDE_SESSION_ID || process.env.MCP_SESSION_ID || randomUUID();
    sessionInfo;
    constructor() {
        this.mcpServer = new McpServer({
            name: 'codex-supervisor',
            version: '1.0.0',
        });
    }
    async start() {
        this.sessionInfo = await this.daemonClient.registerSession(this.sessionId);
        this.sessionId = this.sessionInfo.sessionId;
        logger.info('McpServerSdk', `Session bridge ready: ${this.sessionId}`);
        this.registerTools();
        const transport = new StdioServerTransport();
        await this.mcpServer.connect(transport);
        logger.info('McpServerSdk', 'MCP server bridge started (stdio transport)');
    }
    async callTool(toolName, args) {
        const result = await this.daemonClient.callTool(this.sessionId, toolName, args);
        if (toolName === 'session_get_id' && !result.isError) {
            try {
                this.sessionInfo = JSON.parse(result.content[0]?.text || '{}');
            }
            catch {
                // ignore parse failures
            }
        }
        return {
            content: result.content.map(item => ({
                type: 'text',
                text: item.text,
            })),
            isError: result.isError,
        };
    }
    registerTools() {
        this.mcpServer.tool('supervisor_start_project', 'Create a new supervised project for Codex CLI workers', {
            name: z.string().describe('Project name'),
            description: z.string().describe('Project description/goal'),
            workingDirectory: z.string().describe('Working directory path (must exist)'),
        }, async (args) => this.callTool('supervisor_start_project', args));
        this.mcpServer.tool('supervisor_get_status', 'Get project status and details', {
            projectId: z.string().describe('Project UUID'),
        }, async (args) => this.callTool('supervisor_get_status', args));
        this.mcpServer.tool('supervisor_list_projects', 'List all projects', {}, async () => this.callTool('supervisor_list_projects', {}));
        this.mcpServer.tool('task_decompose', 'Decompose project into tasks', {
            projectId: z.string().describe('Project UUID'),
            tasks: z.array(z.object({
                subject: z.string().describe('Task subject/title'),
                description: z.string().describe('Task description'),
                priority: z.number().optional().describe('Priority (lower = higher)'),
                blockedBy: z.array(z.string()).optional().describe('IDs of blocking tasks'),
            })).describe('List of tasks to create'),
        }, async (args) => this.callTool('task_decompose', args));
        this.mcpServer.tool('task_list', 'List all tasks for a project', {
            projectId: z.string().describe('Project UUID'),
        }, async (args) => this.callTool('task_list', args));
        this.mcpServer.tool('task_get', 'Get specific task details', {
            projectId: z.string().describe('Project UUID'),
            taskId: z.string().describe('Task UUID'),
        }, async (args) => this.callTool('task_get', args));
        this.mcpServer.tool('task_assign', 'Assign task to a worker', {
            projectId: z.string().describe('Project UUID'),
            taskId: z.string().describe('Task UUID'),
            workerId: z.string().describe('Worker UUID'),
        }, async (args) => this.callTool('task_assign', args));
        this.mcpServer.tool('worker_spawn', 'Spawn a new Codex CLI worker subprocess (separate session)', {
            projectId: z.string().describe('Project UUID'),
            systemPrompt: z.string().optional().describe('Optional system prompt for worker'),
        }, async (args) => this.callTool('worker_spawn', args));
        this.mcpServer.tool('worker_spawn_virtual', 'Bind the current MCP session to a supervisor worker. If the session already has a worker for this project, it is reused.', {
            projectId: z.string().describe('Project UUID'),
            sessionId: z.string().optional().describe('Optional existing session ID to reattach'),
        }, async (args) => this.callTool('worker_spawn_virtual', {
            ...args,
            sessionId: typeof args.sessionId === 'string' && args.sessionId ? args.sessionId : this.sessionId,
        }));
        this.mcpServer.tool('worker_heartbeat', 'Refresh heartbeat for virtual worker - call periodically to show you are still working', { workerId: z.string().describe('Worker UUID (virtual worker)') }, async (args) => this.callTool('worker_heartbeat', args));
        this.mcpServer.tool('task_report_progress', 'Report task progress from current session (for session binding mode).', {
            projectId: z.string().describe('Project UUID'),
            taskId: z.string().describe('Task UUID'),
            status: z.string().describe('Status: started, in_progress, blocked, completed, failed'),
            summary: z.string().optional().describe('Optional progress summary'),
        }, async (args) => this.callTool('task_report_progress', args));
        this.mcpServer.tool('worker_list', 'List all workers for a project', {
            projectId: z.string().describe('Project UUID'),
        }, async (args) => this.callTool('worker_list', args));
        this.mcpServer.tool('worker_terminate', 'Terminate a worker', {
            workerId: z.string().describe('Worker UUID'),
            graceful: z.boolean().optional().describe('Graceful termination (default: true)'),
        }, async (args) => this.callTool('worker_terminate', args));
        this.mcpServer.tool('checkpoint_review', 'Review a checkpoint (approve or reject)', {
            projectId: z.string().describe('Project UUID'),
            checkpointId: z.string().describe('Checkpoint UUID'),
            approved: z.boolean().describe('Approve or reject'),
            feedback: z.string().optional().describe('Optional feedback message'),
        }, async (args) => this.callTool('checkpoint_review', args));
        this.mcpServer.tool('checkpoint_list', 'Get pending review checkpoints', {
            projectId: z.string().describe('Project UUID'),
        }, async (args) => this.callTool('checkpoint_list', args));
        this.mcpServer.tool('project_check_completion', 'Check if project meets completion criteria', {
            projectId: z.string().describe('Project UUID'),
        }, async (args) => this.callTool('project_check_completion', args));
        this.mcpServer.tool('project_confirm_supervisor', 'Supervisor confirmation of project completion', {
            projectId: z.string().describe('Project UUID'),
        }, async (args) => this.callTool('project_confirm_supervisor', args));
        this.mcpServer.tool('project_finalize', 'Finalize and archive project', {
            projectId: z.string().describe('Project UUID'),
        }, async (args) => this.callTool('project_finalize', args));
        this.mcpServer.tool('supervisor_get_guidance', 'Get guidance for what to do next (for session binding mode).', { projectId: z.string().describe('Project UUID') }, async (args) => this.callTool('supervisor_get_guidance', args));
        this.mcpServer.tool('session_export', 'Export session for handover to a new session when context is exhausted.', {
            projectId: z.string().describe('Project UUID'),
            sessionId: z.string().optional().describe('Current session ID. Defaults to the active MCP session.'),
            includeHandoverPrompt: z.boolean().optional().describe('Generate handover prompt for new session (default: true)'),
        }, async (args) => this.callTool('session_export', {
            ...args,
            sessionId: typeof args.sessionId === 'string' && args.sessionId ? args.sessionId : this.sessionId,
            includeHandoverPrompt: args.includeHandoverPrompt ?? true,
        }));
        this.mcpServer.tool('session_get_handover_prompt', 'Get handover prompt for a new session.', {
            projectId: z.string().describe('Project UUID'),
            sessionId: z.string().optional().describe('Current session ID. Defaults to the active MCP session.'),
        }, async (args) => this.callTool('session_get_handover_prompt', {
            ...args,
            sessionId: typeof args.sessionId === 'string' && args.sessionId ? args.sessionId : this.sessionId,
        }));
        this.mcpServer.tool('session_get_id', 'Get current session ID for the MCP connection.', {}, async () => this.callTool('session_get_id', {}));
        this.mcpServer.tool('session_list_all', 'List all active sessions across all MCP connections.', {}, async () => this.callTool('session_list_all', {}));
        this.mcpServer.tool('session_get_stats', 'Get session statistics.', {}, async () => this.callTool('session_get_stats', {}));
        logger.info('McpServerSdk', 'All tools registered');
    }
    async cleanup() {
        logger.info('McpServerSdk', `MCP bridge cleaned up for session ${this.sessionId}`);
    }
}
export async function runMcpServer() {
    const server = new McpServerSdk();
    process.on('SIGINT', async () => {
        logger.info('McpServerSdk', 'Received SIGINT, shutting down MCP bridge...');
        await server.cleanup();
        process.exit(0);
    });
    process.on('SIGTERM', async () => {
        logger.info('McpServerSdk', 'Received SIGTERM, shutting down MCP bridge...');
        await server.cleanup();
        process.exit(0);
    });
    await server.start();
    process.stdin.resume();
    await new Promise((resolve) => {
        const finish = () => resolve();
        process.stdin.once('end', finish);
        process.stdin.once('close', finish);
    });
    logger.info('McpServerSdk', 'stdin closed, shutting down MCP bridge only');
    await server.cleanup();
}
//# sourceMappingURL=mcp-server-sdk.js.map