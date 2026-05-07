/**
 * Worker manager - manages lifecycle of all Codex CLI worker sessions
 */
import { type WorkerRunResult } from './codex-spawner.js';
import type { WorkerProcess, SpawnOptions } from './types.js';
interface WorkerManagerHooks {
    onTaskCompleted?: (worker: WorkerProcess, result: WorkerRunResult) => Promise<void>;
    onTaskFailed?: (worker: WorkerProcess, result: WorkerRunResult) => Promise<void>;
}
export declare class WorkerManager {
    private workers;
    private heartbeatTimer?;
    private reconcileTimer?;
    private reconcileInFlight;
    private hooks;
    private workerStore;
    setHooks(hooks: WorkerManagerHooks): void;
    /**
     * Start heartbeat monitoring
     */
    startHeartbeatMonitor(): void;
    /**
     * Stop heartbeat monitoring
     */
    stopHeartbeatMonitor(): void;
    /**
     * Check if Codex CLI is available
     */
    isCodexAvailable(): Promise<boolean>;
    /**
     * Spawn a new Codex worker
     */
    spawn(options: SpawnOptions): WorkerProcess;
    /**
     * Spawn a virtual worker (for session binding mode)
     * This creates a "virtual" worker that represents the current session
     * No actual subprocess is spawned - it monitors the current AI session
     */
    spawnVirtual(options: SpawnOptions): WorkerProcess;
    /**
     * Restore a virtual worker from persisted session state so a new MCP process
     * can continue supervising the same bound session after reconnect.
     */
    restoreVirtual(workerId: string, options: SpawnOptions): WorkerProcess;
    restoreWorker(options: SpawnOptions & {
        workerId: string;
        type: WorkerProcess['type'];
        status?: WorkerProcess['status'];
        pid?: number;
        promptFile?: string;
        resultFile?: string;
        lastMessage?: string;
        lastError?: string;
        exitCode?: number | null;
        spawnedAt?: string;
        lastHeartbeat?: string;
        terminatedAt?: string;
    }): WorkerProcess;
    /**
     * Get worker by ID
     */
    getWorker(workerId: string): WorkerProcess | undefined;
    /**
     * List all active workers
     */
    listWorkers(): WorkerProcess[];
    /**
     * List workers for a specific project
     */
    listWorkersForProject(projectId: string): WorkerProcess[];
    /**
     * List active (non-terminated) workers
     */
    listActiveWorkers(): WorkerProcess[];
    /**
     * List active workers for a specific project
     */
    listActiveWorkersForProject(projectId: string): WorkerProcess[];
    getActiveWorkerCount(type?: WorkerProcess['type']): number;
    /**
     * Send task to worker
     */
    sendTask(workerId: string, taskDescription: string): boolean;
    reconcileWorker(workerId: string): Promise<void>;
    /**
     * Terminate a worker
     */
    terminate(workerId: string, graceful?: boolean): boolean;
    /**
     * Terminate all workers for a project
     */
    terminateAllForProject(projectId: string, graceful?: boolean): void;
    /**
     * Terminate all workers
     */
    terminateAll(graceful?: boolean): void;
    /**
     * Get worker status summary
     */
    getStatusSummary(): {
        total: number;
        active: number;
        idle: number;
        working: number;
        terminated: number;
        virtual: number;
    };
    /**
     * Refresh heartbeat for a worker (used for virtual/session-bound workers)
     */
    refreshHeartbeat(workerId: string): boolean;
    /**
     * Remove terminated workers from tracking
     */
    cleanupTerminated(): number;
    /**
     * Check heartbeats and mark stale workers
     */
    private checkHeartbeats;
    private runTask;
    private finishDetachedWorkerIfNeeded;
    private reconcileDetachedWorkers;
    private completeWorkerFromResult;
    private persistWorker;
}
export {};
//# sourceMappingURL=worker-manager.d.ts.map