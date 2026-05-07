/**
 * Codex CLI subprocess execution helpers.
 *
 * Workers are modeled as durable slots owned by WorkerManager. A task starts a
 * short-lived runner process, and the runner is responsible for executing
 * `codex exec --json` and persisting the result to disk so daemon restarts can
 * recover supervision state.
 */
import type { SpawnOptions, WorkerProcess } from './types.js';
export interface WorkerRunResult {
    status: 'completed' | 'failed';
    exitCode?: number | null;
    lastMessage?: string;
    error?: string;
    stderrTail?: string[];
}
export declare function createSubprocessWorker(options: SpawnOptions): WorkerProcess;
export declare function startCodexTask(worker: WorkerProcess, taskDescription: string, options?: {
    agentType?: SpawnOptions['agentType'];
}): Promise<void>;
export declare function restartCodexTask(worker: WorkerProcess, options?: {
    agentType?: SpawnOptions['agentType'];
}): Promise<void>;
export declare function readWorkerResult(worker: WorkerProcess): Promise<WorkerRunResult | null>;
export declare function isDetachedWorkerStillRunning(worker: WorkerProcess): boolean;
export declare function markWorkerFinished(worker: WorkerProcess, result: WorkerRunResult): void;
export declare function terminateCodexWorker(worker: WorkerProcess, graceful?: boolean): void;
export declare function checkCodexAvailable(): Promise<boolean>;
//# sourceMappingURL=codex-spawner.d.ts.map