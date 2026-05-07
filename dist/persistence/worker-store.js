/**
 * Worker persistence store.
 *
 * Subprocess workers must survive daemon restarts, so we persist their runtime
 * metadata separately from the in-memory WorkerManager.
 */
import { ensureDir, readJsonFile, writeJsonFile } from '../utils/common.js';
import { getWorkersFile } from '../utils/paths.js';
import { dirname } from 'path';
export class WorkerStore {
    writeQueues = new Map();
    async listWorkers(projectId) {
        const file = getWorkersFile(projectId);
        const workers = await readJsonFile(file);
        return Array.isArray(workers) ? workers : [];
    }
    async loadWorker(projectId, workerId) {
        const workers = await this.listWorkers(projectId);
        return workers.find(worker => worker.id === workerId) ?? null;
    }
    async upsertWorker(projectId, worker) {
        await this.enqueue(projectId, async () => {
            const workers = await this.listWorkers(projectId);
            const nextWorkers = workers.filter(item => item.id !== worker.id);
            nextWorkers.push(worker);
            await this.saveWorkers(projectId, nextWorkers);
        });
    }
    async removeWorker(projectId, workerId) {
        await this.enqueue(projectId, async () => {
            const workers = await this.listWorkers(projectId);
            await this.saveWorkers(projectId, workers.filter(worker => worker.id !== workerId));
        });
    }
    async saveWorkers(projectId, workers) {
        const file = getWorkersFile(projectId);
        await ensureDir(dirname(file));
        await writeJsonFile(file, workers);
    }
    async enqueue(projectId, action) {
        const current = this.writeQueues.get(projectId) || Promise.resolve();
        const next = current.then(action);
        this.writeQueues.set(projectId, next.catch(() => undefined));
        await next;
    }
}
//# sourceMappingURL=worker-store.js.map