/**
 * Worker session spawner - creates Claude CLI child processes
 */
import type { SpawnOptions, WorkerProcess } from './types.js';
/**
 * Spawn a new worker Claude Code session
 */
export declare function spawnWorker(options: SpawnOptions): WorkerProcess;
/**
 * Send a message to a worker via stdin
 */
export declare function sendToWorker(worker: WorkerProcess, message: string): void;
/**
 * Terminate a worker process
 */
export declare function terminateWorker(worker: WorkerProcess, graceful?: boolean): void;
//# sourceMappingURL=session-spawner.d.ts.map