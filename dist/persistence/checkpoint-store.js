/**
 * Checkpoint persistence store
 */
import { ensureDir, readJsonFile, writeJsonFile } from '../utils/common.js';
import { getCheckpointFile, getCheckpointsDir } from '../utils/paths.js';
import { generateId } from '../utils/common.js';
import { logger } from '../utils/logger.js';
export class CheckpointStore {
    /**
     * Create a new checkpoint
     */
    async createCheckpoint(projectId, taskId, type) {
        const checkpointId = generateId();
        await ensureDir(getCheckpointsDir(projectId));
        const checkpoint = {
            id: checkpointId,
            taskId,
            projectId,
            type,
            status: 'pending',
            createdAt: new Date().toISOString(),
        };
        await this.saveCheckpoint(checkpoint);
        logger.info('CheckpointStore', 'Checkpoint created', { checkpointId, taskId, type });
        return checkpoint;
    }
    /**
     * Save checkpoint
     */
    async saveCheckpoint(checkpoint) {
        await writeJsonFile(getCheckpointFile(checkpoint.projectId, checkpoint.id), checkpoint);
    }
    /**
     * Load checkpoint by ID
     */
    async loadCheckpoint(projectId, checkpointId) {
        return readJsonFile(getCheckpointFile(projectId, checkpointId));
    }
    /**
     * List checkpoints for a task
     */
    async listCheckpointsForTask(projectId, taskId) {
        const fs = await import('fs/promises');
        const checkpointsDir = getCheckpointsDir(projectId);
        await ensureDir(checkpointsDir);
        try {
            const entries = await fs.readdir(checkpointsDir, { withFileTypes: true });
            const checkpoints = [];
            for (const entry of entries) {
                if (entry.isFile() && entry.name.endsWith('.json')) {
                    const checkpointId = entry.name.slice(0, -5);
                    const checkpoint = await this.loadCheckpoint(projectId, checkpointId);
                    if (checkpoint && checkpoint.taskId === taskId) {
                        checkpoints.push(checkpoint);
                    }
                }
            }
            return checkpoints.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        }
        catch {
            return [];
        }
    }
    /**
     * List all checkpoints for a project
     */
    async listCheckpoints(projectId) {
        const fs = await import('fs/promises');
        const checkpointsDir = getCheckpointsDir(projectId);
        await ensureDir(checkpointsDir);
        try {
            const entries = await fs.readdir(checkpointsDir, { withFileTypes: true });
            const checkpoints = [];
            for (const entry of entries) {
                if (entry.isFile() && entry.name.endsWith('.json')) {
                    const checkpointId = entry.name.slice(0, -5);
                    const checkpoint = await this.loadCheckpoint(projectId, checkpointId);
                    if (checkpoint) {
                        checkpoints.push(checkpoint);
                    }
                }
            }
            return checkpoints.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        }
        catch {
            return [];
        }
    }
    /**
     * Submit checkpoint with results
     */
    async submitCheckpoint(projectId, checkpointId, summary, codeChanges, testResults) {
        const checkpoint = await this.loadCheckpoint(projectId, checkpointId);
        if (!checkpoint) {
            return null;
        }
        checkpoint.status = 'submitted';
        checkpoint.summary = summary;
        checkpoint.codeChanges = codeChanges;
        checkpoint.testResults = testResults;
        await this.saveCheckpoint(checkpoint);
        logger.info('CheckpointStore', 'Checkpoint submitted', { checkpointId });
        return checkpoint;
    }
    /**
     * Approve checkpoint
     */
    async approveCheckpoint(projectId, checkpointId) {
        const checkpoint = await this.loadCheckpoint(projectId, checkpointId);
        if (!checkpoint) {
            return null;
        }
        checkpoint.status = 'approved';
        checkpoint.reviewedAt = new Date().toISOString();
        await this.saveCheckpoint(checkpoint);
        logger.info('CheckpointStore', 'Checkpoint approved', { checkpointId });
        return checkpoint;
    }
    /**
     * Reject checkpoint with feedback
     */
    async rejectCheckpoint(projectId, checkpointId, feedback) {
        const checkpoint = await this.loadCheckpoint(projectId, checkpointId);
        if (!checkpoint) {
            return null;
        }
        checkpoint.status = 'rejected';
        checkpoint.feedback = feedback;
        checkpoint.reviewedAt = new Date().toISOString();
        await this.saveCheckpoint(checkpoint);
        logger.info('CheckpointStore', 'Checkpoint rejected', { checkpointId });
        return checkpoint;
    }
    /**
     * Get last checkpoint for a task
     */
    async getLastCheckpoint(projectId, taskId) {
        const checkpoints = await this.listCheckpointsForTask(projectId, taskId);
        return checkpoints.length > 0 ? (checkpoints[checkpoints.length - 1] ?? null) : null;
    }
    /**
     * Get pending checkpoints (submitted but not reviewed)
     */
    async getPendingReviewCheckpoints(projectId) {
        const checkpoints = await this.listCheckpoints(projectId);
        return checkpoints.filter(c => c.status === 'submitted');
    }
    /**
     * Delete checkpoint
     */
    async deleteCheckpoint(projectId, checkpointId) {
        const fs = await import('fs/promises');
        try {
            await fs.unlink(getCheckpointFile(projectId, checkpointId));
            logger.info('CheckpointStore', 'Checkpoint deleted', { checkpointId });
            return true;
        }
        catch {
            return false;
        }
    }
}
//# sourceMappingURL=checkpoint-store.js.map