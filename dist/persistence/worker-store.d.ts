/**
 * Worker persistence store.
 *
 * Subprocess workers must survive daemon restarts, so we persist their runtime
 * metadata separately from the in-memory WorkerManager.
 */
import type { WorkerSession } from './types.js';
export declare class WorkerStore {
    private writeQueues;
    listWorkers(projectId: string): Promise<WorkerSession[]>;
    loadWorker(projectId: string, workerId: string): Promise<WorkerSession | null>;
    upsertWorker(projectId: string, worker: WorkerSession): Promise<void>;
    removeWorker(projectId: string, workerId: string): Promise<void>;
    saveWorkers(projectId: string, workers: WorkerSession[]): Promise<void>;
    private enqueue;
}
//# sourceMappingURL=worker-store.d.ts.map