/**
 * Worker manager - manages lifecycle of all Codex CLI worker sessions
 */
import { createSubprocessWorker, startCodexTask, restartCodexTask, terminateCodexWorker, checkCodexAvailable, readWorkerResult, isDetachedWorkerStillRunning, markWorkerFinished, } from './codex-spawner.js';
import { generateId } from '../utils/common.js';
import { logger } from '../utils/logger.js';
import { WorkerStore } from '../persistence/worker-store.js';
function getTimeoutMs(envValue, fallbackMs) {
    const parsed = Number(envValue);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallbackMs;
    }
    return parsed;
}
const DEFAULT_WORKER_TIMEOUT_MS = 4 * 60 * 60 * 1000; // 4 hours
const HEARTBEAT_TIMEOUT_MS = getTimeoutMs(process.env.CODEX_SUBPROCESS_WORKER_TIMEOUT_MS || process.env.CODEX_WORKER_TIMEOUT_MS, DEFAULT_WORKER_TIMEOUT_MS);
const VIRTUAL_HEARTBEAT_TIMEOUT_MS = getTimeoutMs(process.env.CODEX_VIRTUAL_WORKER_TIMEOUT_MS || process.env.CODEX_WORKER_TIMEOUT_MS, DEFAULT_WORKER_TIMEOUT_MS);
const HEARTBEAT_CHECK_INTERVAL_MS = 30 * 1000; // 30 seconds
const RECONCILE_CHECK_INTERVAL_MS = getTimeoutMs(process.env.CODEX_SUBPROCESS_RECONCILE_INTERVAL_MS, 5000);
export class WorkerManager {
    workers = new Map();
    heartbeatTimer;
    reconcileTimer;
    reconcileInFlight = new Set();
    hooks = {};
    workerStore = new WorkerStore();
    setHooks(hooks) {
        this.hooks = hooks;
    }
    /**
     * Start heartbeat monitoring
     */
    startHeartbeatMonitor() {
        if (!this.heartbeatTimer) {
            this.heartbeatTimer = setInterval(() => {
                this.checkHeartbeats();
            }, HEARTBEAT_CHECK_INTERVAL_MS);
            this.heartbeatTimer.unref?.();
        }
        if (!this.reconcileTimer) {
            this.reconcileTimer = setInterval(() => {
                void this.reconcileDetachedWorkers().catch((error) => {
                    logger.error('WorkerManager', 'Background worker reconciliation failed', {
                        error: error instanceof Error ? error.message : String(error),
                    });
                });
            }, RECONCILE_CHECK_INTERVAL_MS);
            this.reconcileTimer.unref?.();
        }
        logger.info('WorkerManager', 'Heartbeat monitor started');
    }
    /**
     * Stop heartbeat monitoring
     */
    stopHeartbeatMonitor() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = undefined;
        }
        if (this.reconcileTimer) {
            clearInterval(this.reconcileTimer);
            this.reconcileTimer = undefined;
        }
        logger.info('WorkerManager', 'Heartbeat monitor stopped');
    }
    /**
     * Check if Codex CLI is available
     */
    async isCodexAvailable() {
        return checkCodexAvailable();
    }
    /**
     * Spawn a new Codex worker
     */
    spawn(options) {
        const worker = createSubprocessWorker(options);
        this.workers.set(worker.id, worker);
        void this.persistWorker(worker);
        return worker;
    }
    /**
     * Spawn a virtual worker (for session binding mode)
     * This creates a "virtual" worker that represents the current session
     * No actual subprocess is spawned - it monitors the current AI session
     */
    spawnVirtual(options) {
        const virtualWorker = {
            id: `virtual-${generateId()}`,
            projectId: options.projectId,
            taskId: options.taskId,
            status: 'idle',
            type: 'virtual',
            process: undefined, // No subprocess
            spawnedAt: new Date().toISOString(),
            lastHeartbeat: new Date().toISOString(),
            outputBuffer: [],
            errorBuffer: [],
        };
        this.workers.set(virtualWorker.id, virtualWorker);
        void this.persistWorker(virtualWorker);
        logger.info('WorkerManager', 'Virtual worker spawned for session binding', {
            workerId: virtualWorker.id,
            projectId: options.projectId,
        });
        return virtualWorker;
    }
    /**
     * Restore a virtual worker from persisted session state so a new MCP process
     * can continue supervising the same bound session after reconnect.
     */
    restoreVirtual(workerId, options) {
        return this.restoreWorker({
            workerId,
            ...options,
            type: 'virtual',
        });
    }
    restoreWorker(options) {
        const { workerId, type, status = 'idle' } = options;
        const existing = this.workers.get(workerId);
        if (existing) {
            existing.projectId = options.projectId;
            existing.taskId = options.taskId ?? existing.taskId;
            existing.type = type;
            existing.status = existing.status === 'terminated' ? status : existing.status;
            existing.pid = options.pid ?? existing.pid;
            existing.promptFile = options.promptFile ?? existing.promptFile;
            existing.resultFile = options.resultFile ?? existing.resultFile;
            existing.lastMessage = options.lastMessage ?? existing.lastMessage;
            existing.lastError = options.lastError ?? existing.lastError;
            existing.exitCode = options.exitCode ?? existing.exitCode;
            existing.lastHeartbeat = options.lastHeartbeat ?? new Date().toISOString();
            existing.terminatedAt = options.terminatedAt ?? existing.terminatedAt;
            existing.workingDirectory = options.workingDirectory ?? existing.workingDirectory;
            void this.persistWorker(existing);
            return existing;
        }
        const worker = {
            id: workerId,
            projectId: options.projectId,
            taskId: options.taskId,
            status,
            type,
            process: undefined,
            pid: options.pid,
            workingDirectory: options.workingDirectory,
            promptFile: options.promptFile,
            resultFile: options.resultFile,
            lastMessage: options.lastMessage,
            lastError: options.lastError,
            exitCode: options.exitCode,
            spawnedAt: options.spawnedAt ?? new Date().toISOString(),
            lastHeartbeat: options.lastHeartbeat ?? new Date().toISOString(),
            terminatedAt: options.terminatedAt,
            outputBuffer: [],
            errorBuffer: [],
        };
        this.workers.set(workerId, worker);
        void this.persistWorker(worker);
        logger.info('WorkerManager', 'Worker restored from session registry', {
            workerId,
            type,
            projectId: options.projectId,
            taskId: options.taskId,
        });
        return worker;
    }
    /**
     * Get worker by ID
     */
    getWorker(workerId) {
        return this.workers.get(workerId);
    }
    /**
     * List all active workers
     */
    listWorkers() {
        return Array.from(this.workers.values());
    }
    /**
     * List workers for a specific project
     */
    listWorkersForProject(projectId) {
        return this.listWorkers().filter(w => w.projectId === projectId);
    }
    /**
     * List active (non-terminated) workers
     */
    listActiveWorkers() {
        return this.listWorkers().filter(w => w.status !== 'terminated');
    }
    /**
     * List active workers for a specific project
     */
    listActiveWorkersForProject(projectId) {
        return this.listWorkers().filter(w => w.projectId === projectId && w.status !== 'terminated');
    }
    getActiveWorkerCount(type) {
        return this.listActiveWorkers().filter(worker => {
            if (!type) {
                return true;
            }
            return worker.type === type;
        }).length;
    }
    /**
     * Send task to worker
     */
    sendTask(workerId, taskDescription) {
        const worker = this.workers.get(workerId);
        if (!worker) {
            logger.warn('WorkerManager', 'Worker not found', { workerId });
            return false;
        }
        void this.persistWorker(worker);
        void this.runTask(worker, taskDescription);
        return true;
    }
    async reconcileWorker(workerId) {
        const worker = this.workers.get(workerId);
        if (!worker || worker.type !== 'subprocess' || worker.status !== 'working') {
            return;
        }
        if (this.reconcileInFlight.has(workerId)) {
            return;
        }
        this.reconcileInFlight.add(workerId);
        try {
            const result = await readWorkerResult(worker);
            if (result) {
                await this.completeWorkerFromResult(worker, result);
                return;
            }
            if (worker.process && worker.process.exitCode === null) {
                return;
            }
            if (!worker.process && isDetachedWorkerStillRunning(worker)) {
                worker.lastHeartbeat = new Date().toISOString();
                await this.persistWorker(worker);
                return;
            }
            if (worker.promptFile) {
                logger.warn('WorkerManager', 'Subprocess worker died without a terminal result; restarting task runner', {
                    workerId: worker.id,
                    taskId: worker.taskId,
                });
                await restartCodexTask(worker);
                await this.persistWorker(worker);
            }
        }
        finally {
            this.reconcileInFlight.delete(workerId);
        }
    }
    /**
     * Terminate a worker
     */
    terminate(workerId, graceful = true) {
        const worker = this.workers.get(workerId);
        if (!worker) {
            logger.warn('WorkerManager', 'Worker not found for termination', { workerId });
            return false;
        }
        if (worker.type === 'virtual') {
            // Virtual workers don't have a subprocess to terminate
            worker.status = 'terminated';
            worker.terminatedAt = new Date().toISOString();
            void this.persistWorker(worker);
            logger.info('WorkerManager', 'Virtual worker terminated', { workerId });
            return true;
        }
        terminateCodexWorker(worker, graceful);
        void this.persistWorker(worker);
        return true;
    }
    /**
     * Terminate all workers for a project
     */
    terminateAllForProject(projectId, graceful = true) {
        const workers = this.listWorkersForProject(projectId);
        for (const worker of workers) {
            if (worker.type === 'virtual') {
                worker.status = 'terminated';
                worker.terminatedAt = new Date().toISOString();
                void this.persistWorker(worker);
                continue;
            }
            terminateCodexWorker(worker, graceful);
            void this.persistWorker(worker);
        }
        logger.info('WorkerManager', 'All workers terminated for project', { projectId, count: workers.length });
    }
    /**
     * Terminate all workers
     */
    terminateAll(graceful = true) {
        for (const worker of this.workers.values()) {
            if (worker.type === 'virtual') {
                worker.status = 'terminated';
                worker.terminatedAt = new Date().toISOString();
                void this.persistWorker(worker);
                continue;
            }
            terminateCodexWorker(worker, graceful);
            void this.persistWorker(worker);
        }
        logger.info('WorkerManager', 'All workers terminated', { count: this.workers.size });
    }
    /**
     * Get worker status summary
     */
    getStatusSummary() {
        const workers = this.listWorkers();
        return {
            total: workers.length,
            active: workers.filter(w => w.status !== 'terminated').length,
            idle: workers.filter(w => w.status === 'idle').length,
            working: workers.filter(w => w.status === 'working').length,
            terminated: workers.filter(w => w.status === 'terminated').length,
            virtual: workers.filter(w => w.type === 'virtual').length,
        };
    }
    /**
     * Refresh heartbeat for a worker (used for virtual/session-bound workers)
     */
    refreshHeartbeat(workerId) {
        const worker = this.workers.get(workerId);
        if (!worker) {
            logger.warn('WorkerManager', 'Worker not found for heartbeat refresh', { workerId });
            return false;
        }
        worker.lastHeartbeat = new Date().toISOString();
        void this.persistWorker(worker);
        logger.debug('WorkerManager', 'Heartbeat refreshed', { workerId, type: worker.type });
        return true;
    }
    /**
     * Remove terminated workers from tracking
     */
    cleanupTerminated() {
        let removed = 0;
        for (const [id, worker] of this.workers) {
            if (worker.status === 'terminated') {
                this.workers.delete(id);
                removed++;
            }
        }
        if (removed > 0) {
            logger.info('WorkerManager', 'Cleaned up terminated workers', { count: removed });
        }
        return removed;
    }
    /**
     * Check heartbeats and mark stale workers
     */
    checkHeartbeats() {
        const now = Date.now();
        for (const [id, worker] of this.workers) {
            if (worker.status === 'terminated') {
                continue;
            }
            // Virtual workers (session binding) have a longer timeout
            // because the user is actively working in the current session
            const timeout = worker.type === 'virtual'
                ? VIRTUAL_HEARTBEAT_TIMEOUT_MS
                : HEARTBEAT_TIMEOUT_MS;
            const lastHeartbeat = new Date(worker.lastHeartbeat).getTime();
            const elapsed = now - lastHeartbeat;
            if (elapsed > timeout) {
                logger.warn('WorkerManager', 'Worker heartbeat timeout', {
                    workerId: id,
                    type: worker.type,
                    elapsed: Math.round(elapsed / 1000),
                });
                // Virtual workers just get a warning, don't mark as blocked
                if (worker.type !== 'virtual') {
                    if (worker.process || typeof worker.pid === 'number') {
                        void this.finishDetachedWorkerIfNeeded(worker);
                    }
                    else {
                        worker.status = 'blocked';
                        void this.persistWorker(worker);
                    }
                }
            }
        }
    }
    async runTask(worker, taskDescription) {
        try {
            await startCodexTask(worker, taskDescription);
            await this.persistWorker(worker);
            const processHandle = worker.process;
            if (!processHandle) {
                throw new Error(`Worker ${worker.id} did not create a runner process`);
            }
            processHandle.once('exit', async () => {
                try {
                    await this.finishDetachedWorkerIfNeeded(worker);
                }
                catch (error) {
                    logger.error('WorkerManager', 'Failed to finalize subprocess worker after runner exit', {
                        workerId: worker.id,
                        projectId: worker.projectId,
                        taskId: worker.taskId,
                        error: error instanceof Error ? error.message : String(error),
                    });
                }
            });
        }
        catch (error) {
            worker.status = 'blocked';
            worker.lastError = error instanceof Error ? error.message : String(error);
            worker.lastHeartbeat = new Date().toISOString();
            await this.persistWorker(worker);
            if (this.hooks.onTaskFailed) {
                await this.hooks.onTaskFailed(worker, {
                    status: 'failed',
                    error: worker.lastError,
                });
            }
        }
    }
    async finishDetachedWorkerIfNeeded(worker) {
        await this.reconcileWorker(worker.id);
    }
    async reconcileDetachedWorkers() {
        const workers = this.listActiveWorkers().filter(worker => worker.type === 'subprocess' && worker.status === 'working');
        await Promise.all(workers.map(async (worker) => {
            try {
                await this.reconcileWorker(worker.id);
            }
            catch (error) {
                logger.error('WorkerManager', 'Failed to reconcile subprocess worker', {
                    workerId: worker.id,
                    projectId: worker.projectId,
                    taskId: worker.taskId,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }));
    }
    async completeWorkerFromResult(worker, result) {
        if (result.status === 'completed') {
            await this.hooks.onTaskCompleted?.(worker, result);
        }
        else {
            await this.hooks.onTaskFailed?.(worker, result);
        }
        markWorkerFinished(worker, result);
        await this.persistWorker(worker);
    }
    async persistWorker(worker) {
        const persisted = {
            id: worker.id,
            projectId: worker.projectId,
            taskId: worker.taskId,
            status: worker.status,
            type: worker.type === 'virtual' ? 'virtual' : 'subprocess',
            spawnedAt: worker.spawnedAt,
            lastHeartbeat: worker.lastHeartbeat,
            terminatedAt: worker.terminatedAt,
            pid: worker.pid,
            workingDirectory: worker.workingDirectory,
            promptFile: worker.promptFile,
            resultFile: worker.resultFile,
            lastMessage: worker.lastMessage,
            lastError: worker.lastError,
            exitCode: worker.exitCode,
        };
        await this.workerStore.upsertWorker(worker.projectId, persisted);
    }
}
//# sourceMappingURL=worker-manager.js.map