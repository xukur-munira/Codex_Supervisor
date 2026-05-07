/**
 * Worker session spawner - creates Claude CLI child processes
 */
import { spawn } from 'child_process';
import { generateId } from '../utils/common.js';
import { logger } from '../utils/logger.js';
import { createJsonStreamParser } from './stream-parser.js';
const CLAUDE_CLI = process.env.CLAUDE_CLI_PATH || 'claude';
/**
 * Spawn a new worker Claude Code session
 */
export function spawnWorker(options) {
    const sessionId = generateId();
    const args = buildClaudeArgs(sessionId, options);
    logger.info('SessionSpawner', 'Spawning worker', {
        sessionId,
        projectId: options.projectId,
        taskId: options.taskId,
        agentType: options.agentType,
    });
    const childProcess = spawn(CLAUDE_CLI, args, {
        cwd: options.workingDirectory || process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
            ...process.env,
            CODEX_SESSION_ID: sessionId,
            CODEX_PROJECT_ID: options.projectId,
        },
        shell: true,
    });
    const worker = {
        id: sessionId,
        projectId: options.projectId,
        taskId: options.taskId,
        status: 'spawning',
        process: childProcess,
        spawnedAt: new Date().toISOString(),
        lastHeartbeat: new Date().toISOString(),
        outputBuffer: [],
        errorBuffer: [],
    };
    setupStreamHandlers(worker, options);
    return worker;
}
/**
 * Build Claude CLI arguments
 */
function buildClaudeArgs(sessionId, options) {
    const args = [
        '--print',
        '--output-format', 'stream-json',
        '--input-format', 'stream-json',
        '--dangerously-skip-permissions',
        '--name', `codex-worker-${sessionId.slice(0, 8)}`,
    ];
    if (options.mcpConfig) {
        args.push('--mcp-config', options.mcpConfig);
    }
    if (options.systemPrompt) {
        args.push('--system-prompt', options.systemPrompt);
    }
    if (options.tools && options.tools.length > 0) {
        args.push('--tools', options.tools.join(','));
    }
    // Append the task as the initial prompt if provided
    if (options.taskId) {
        // The task description will be sent via stdin as a stream-json message
    }
    return args;
}
/**
 * Set up stream handlers for the worker process
 */
function setupStreamHandlers(worker, options) {
    const stdoutParser = createJsonStreamParser();
    const stderrParser = createJsonStreamParser();
    // Handle stdout (stream-json messages)
    worker.process?.stdout?.on('data', (chunk) => {
        const messages = stdoutParser.parse(chunk.toString());
        for (const msg of messages) {
            worker.outputBuffer.push(JSON.stringify(msg));
            // Keep buffer manageable
            if (worker.outputBuffer.length > 1000) {
                worker.outputBuffer = worker.outputBuffer.slice(-500);
            }
            // Handle worker idle/completion
            if (msg.stop_reason === 'end_turn' || msg.stop_reason === 'max_tokens') {
                worker.lastHeartbeat = new Date().toISOString();
                logger.debug('SessionSpawner', 'Worker turn ended', {
                    sessionId: worker.id,
                    stopReason: msg.stop_reason,
                });
            }
        }
    });
    // Handle stderr
    worker.process?.stderr?.on('data', (chunk) => {
        const text = chunk.toString();
        worker.errorBuffer.push(text);
        // Keep buffer manageable
        if (worker.errorBuffer.length > 100) {
            worker.errorBuffer = worker.errorBuffer.slice(-50);
        }
        logger.debug('SessionSpawner', 'Worker stderr', {
            sessionId: worker.id,
            output: text.slice(0, 200),
        });
    });
    // Handle process exit
    worker.process?.on('exit', (code, signal) => {
        worker.status = 'terminated';
        worker.terminatedAt = new Date().toISOString();
        logger.info('SessionSpawner', 'Worker process exited', {
            sessionId: worker.id,
            code,
            signal,
        });
    });
    // Handle spawn error
    worker.process?.on('error', (error) => {
        worker.status = 'terminated';
        worker.terminatedAt = new Date().toISOString();
        logger.error('SessionSpawner', 'Worker spawn error', {
            sessionId: worker.id,
            error: error.message,
        });
    });
    // Update status once process is running
    worker.process?.on('spawn', () => {
        worker.status = 'idle';
        logger.info('SessionSpawner', 'Worker spawned successfully', {
            sessionId: worker.id,
        });
    });
}
/**
 * Send a message to a worker via stdin
 */
export function sendToWorker(worker, message) {
    if (!worker.process?.stdin) {
        logger.error('SessionSpawner', 'Worker has no stdin', { sessionId: worker.id });
        return;
    }
    if (worker.status === 'terminated') {
        logger.error('SessionSpawner', 'Worker is terminated', { sessionId: worker.id });
        return;
    }
    const jsonLine = JSON.stringify({
        type: 'user_message',
        content: message,
    }) + '\n';
    worker.process.stdin.write(jsonLine);
    worker.lastHeartbeat = new Date().toISOString();
}
/**
 * Terminate a worker process
 */
export function terminateWorker(worker, graceful = true) {
    if (worker.status === 'terminated') {
        return;
    }
    if (graceful) {
        // Send a termination message first
        sendToWorker(worker, 'TERMINATE: Please finish current work and exit.');
        // Force kill after timeout
        setTimeout(() => {
            if (worker.process && !worker.process.killed) {
                worker.process.kill('SIGKILL');
            }
        }, 10000);
    }
    else {
        worker.process?.kill('SIGKILL');
    }
    worker.status = 'terminated';
    worker.terminatedAt = new Date().toISOString();
    logger.info('SessionSpawner', 'Worker terminated', {
        sessionId: worker.id,
        graceful,
    });
}
//# sourceMappingURL=session-spawner.js.map