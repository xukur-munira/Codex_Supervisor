/**
 * Codex CLI subprocess execution helpers.
 *
 * Workers are modeled as durable slots owned by WorkerManager. A task starts a
 * short-lived runner process, and the runner is responsible for executing
 * `codex exec --json` and persisting the result to disk so daemon restarts can
 * recover supervision state.
 */
import { spawn } from 'child_process';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { generateId } from '../utils/common.js';
import { logger } from '../utils/logger.js';
import { getWorkerPromptFile, getWorkerResultFile } from '../utils/paths.js';
const CODEX_CLI = process.env.CODEX_CLI_PATH || 'codex';
function getRunnerEntryPath() {
    return resolve(dirname(fileURLToPath(import.meta.url)), './codex-exec-runner.js');
}
function isProcessAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    }
    catch {
        return false;
    }
}
export function createSubprocessWorker(options) {
    const workerId = generateId();
    return {
        id: workerId,
        projectId: options.projectId,
        taskId: options.taskId,
        status: 'idle',
        type: 'subprocess',
        process: undefined,
        workingDirectory: options.workingDirectory,
        promptFile: getWorkerPromptFile(options.projectId, workerId),
        resultFile: getWorkerResultFile(options.projectId, workerId),
        spawnedAt: new Date().toISOString(),
        lastHeartbeat: new Date().toISOString(),
        outputBuffer: [],
        errorBuffer: [],
    };
}
export async function startCodexTask(worker, taskDescription, options) {
    if (!worker.workingDirectory) {
        throw new Error(`Worker ${worker.id} does not have a working directory`);
    }
    if (!worker.promptFile || !worker.resultFile) {
        throw new Error(`Worker ${worker.id} does not have prompt/result paths configured`);
    }
    await mkdir(dirname(worker.promptFile), { recursive: true });
    await mkdir(dirname(worker.resultFile), { recursive: true });
    await writeFile(worker.promptFile, formatTaskForCodex(taskDescription, worker.taskId), 'utf-8');
    await launchRunner(worker, options);
}
export async function restartCodexTask(worker, options) {
    if (!worker.workingDirectory || !worker.promptFile || !worker.resultFile) {
        throw new Error(`Worker ${worker.id} is missing persisted execution metadata`);
    }
    await mkdir(dirname(worker.promptFile), { recursive: true });
    await mkdir(dirname(worker.resultFile), { recursive: true });
    await launchRunner(worker, options);
}
async function launchRunner(worker, options) {
    const payload = Buffer.from(JSON.stringify({
        workerId: worker.id,
        projectId: worker.projectId,
        taskId: worker.taskId,
        promptFile: worker.promptFile,
        resultFile: worker.resultFile,
        workingDirectory: worker.workingDirectory,
        agentType: options?.agentType,
    }), 'utf-8').toString('base64url');
    const childProcess = spawn(process.execPath, [getRunnerEntryPath(), '--payload', payload], {
        cwd: worker.workingDirectory,
        env: process.env,
        stdio: ['ignore', 'ignore', 'pipe'],
        shell: false,
        windowsHide: true,
    });
    worker.process = childProcess;
    worker.pid = childProcess.pid ?? undefined;
    worker.status = 'working';
    worker.lastHeartbeat = new Date().toISOString();
    childProcess.stderr?.on('data', (chunk) => {
        const text = chunk.toString('utf-8');
        worker.errorBuffer.push(text);
        while (worker.errorBuffer.length > 50) {
            worker.errorBuffer.shift();
        }
        worker.lastHeartbeat = new Date().toISOString();
    });
    childProcess.on('spawn', () => {
        worker.lastHeartbeat = new Date().toISOString();
        logger.info('CodexSpawner', 'Codex task runner spawned', {
            workerId: worker.id,
            taskId: worker.taskId,
            pid: worker.pid,
        });
    });
    childProcess.on('error', (error) => {
        worker.status = 'blocked';
        worker.lastError = error.message;
        worker.terminatedAt = new Date().toISOString();
        logger.error('CodexSpawner', 'Codex task runner spawn error', {
            workerId: worker.id,
            taskId: worker.taskId,
            error: error.message,
        });
    });
}
export async function readWorkerResult(worker) {
    if (!worker.resultFile) {
        return null;
    }
    try {
        const content = await readFile(worker.resultFile, 'utf-8');
        const parsed = JSON.parse(content);
        if (parsed.status !== 'completed' && parsed.status !== 'failed') {
            return null;
        }
        return parsed;
    }
    catch {
        return null;
    }
}
export function isDetachedWorkerStillRunning(worker) {
    return typeof worker.pid === 'number' ? isProcessAlive(worker.pid) : false;
}
export function markWorkerFinished(worker, result) {
    worker.process = undefined;
    worker.pid = undefined;
    worker.exitCode = result.exitCode ?? null;
    worker.lastMessage = result.lastMessage;
    worker.lastError = result.error;
    worker.status = result.status === 'completed' ? 'idle' : 'blocked';
    worker.lastHeartbeat = new Date().toISOString();
    worker.terminatedAt = new Date().toISOString();
}
export function terminateCodexWorker(worker, graceful = true) {
    if (worker.status === 'terminated') {
        return;
    }
    const processHandle = worker.process;
    if (processHandle) {
        if (graceful) {
            processHandle.kill('SIGTERM');
            setTimeout(() => {
                if (processHandle.exitCode === null && !processHandle.killed) {
                    processHandle.kill('SIGKILL');
                }
            }, 10000).unref?.();
        }
        else {
            processHandle.kill('SIGKILL');
        }
    }
    else if (typeof worker.pid === 'number') {
        try {
            process.kill(worker.pid, graceful ? 'SIGTERM' : 'SIGKILL');
        }
        catch {
            // ignore
        }
    }
    worker.status = 'terminated';
    worker.terminatedAt = new Date().toISOString();
    logger.info('CodexSpawner', 'Codex worker terminated', {
        workerId: worker.id,
        graceful,
    });
}
function formatTaskForCodex(description, taskId) {
    const lines = [];
    lines.push('## Task Assignment');
    if (taskId) {
        lines.push(`Task ID: ${taskId}`);
    }
    lines.push('');
    lines.push('### Instructions');
    lines.push(description);
    lines.push('');
    lines.push('### Requirements');
    lines.push('- Complete the task as described');
    lines.push('- Do not stop until the assigned task is actually finished');
    lines.push('- Summarize what changed and any verification you performed');
    lines.push('');
    lines.push('Begin execution now.');
    return lines.join('\n');
}
export async function checkCodexAvailable() {
    try {
        const result = spawn(CODEX_CLI, ['--version'], { shell: process.platform === 'win32', windowsHide: true });
        return await new Promise((resolve) => {
            result.on('exit', (code) => resolve(code === 0));
            result.on('error', () => resolve(false));
        });
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=codex-spawner.js.map