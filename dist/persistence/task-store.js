/**
 * Task persistence store
 */
import { ensureDir, readJsonFile, writeJsonFile } from '../utils/common.js';
import { getTaskFile, getTasksDir } from '../utils/paths.js';
import { generateId } from '../utils/common.js';
import { logger } from '../utils/logger.js';
export class TaskStore {
    /**
     * Create a new task
     */
    async createTask(projectId, subject, description, priority = 5, blockedBy = [], metadata = {}) {
        const taskId = generateId();
        await ensureDir(getTasksDir(projectId));
        const now = new Date().toISOString();
        const task = {
            id: taskId,
            projectId,
            subject,
            description,
            status: 'pending',
            priority,
            blockedBy,
            blocks: [],
            checkpoints: [],
            artifacts: [],
            createdAt: now,
            updatedAt: now,
            metadata,
        };
        await this.saveTask(task);
        // Update blocked tasks to reference this task
        for (const blockerId of blockedBy) {
            const blockerTask = await this.loadTask(projectId, blockerId);
            if (blockerTask) {
                blockerTask.blocks.push(taskId);
                await this.saveTask(blockerTask);
            }
        }
        logger.info('TaskStore', 'Task created', { taskId, projectId, subject });
        return task;
    }
    /**
     * Save task
     */
    async saveTask(task) {
        task.updatedAt = new Date().toISOString();
        await writeJsonFile(getTaskFile(task.projectId, task.id), task);
    }
    /**
     * Load task by ID
     */
    async loadTask(projectId, taskId) {
        return readJsonFile(getTaskFile(projectId, taskId));
    }
    /**
     * List all tasks for a project
     */
    async listTasks(projectId) {
        const fs = await import('fs/promises');
        const tasksDir = getTasksDir(projectId);
        await ensureDir(tasksDir);
        try {
            const entries = await fs.readdir(tasksDir, { withFileTypes: true });
            const tasks = [];
            for (const entry of entries) {
                if (entry.isFile() && entry.name.endsWith('.json')) {
                    const taskId = entry.name.slice(0, -5);
                    const task = await this.loadTask(projectId, taskId);
                    if (task) {
                        tasks.push(task);
                    }
                }
            }
            // Sort by priority
            tasks.sort((a, b) => a.priority - b.priority);
            return tasks;
        }
        catch {
            return [];
        }
    }
    /**
     * Update task status
     */
    async updateStatus(projectId, taskId, status) {
        const task = await this.loadTask(projectId, taskId);
        if (!task) {
            return null;
        }
        task.status = status;
        if (status === 'in_progress') {
            task.startedAt = new Date().toISOString();
        }
        else if (status === 'completed') {
            task.completedAt = new Date().toISOString();
        }
        await this.saveTask(task);
        logger.info('TaskStore', 'Task status updated', { taskId, status });
        return task;
    }
    /**
     * Assign worker to task
     */
    async assignWorker(projectId, taskId, workerId) {
        const task = await this.loadTask(projectId, taskId);
        if (!task) {
            return null;
        }
        task.assignedWorker = workerId;
        task.status = 'assigned';
        await this.saveTask(task);
        logger.info('TaskStore', 'Task assigned to worker', { taskId, workerId });
        return task;
    }
    /**
     * Unassign worker from task
     */
    async unassignWorker(projectId, taskId) {
        const task = await this.loadTask(projectId, taskId);
        if (!task) {
            return null;
        }
        task.assignedWorker = undefined;
        if (task.status === 'assigned' || task.status === 'in_progress') {
            task.status = 'pending';
        }
        await this.saveTask(task);
        return task;
    }
    /**
     * Add checkpoint to task
     */
    async addCheckpoint(projectId, taskId, checkpointId) {
        const task = await this.loadTask(projectId, taskId);
        if (!task) {
            return null;
        }
        task.checkpoints.push(checkpointId);
        await this.saveTask(task);
        return task;
    }
    /**
     * Add artifact to task
     */
    async addArtifact(projectId, taskId, artifact) {
        const task = await this.loadTask(projectId, taskId);
        if (!task) {
            return null;
        }
        task.artifacts.push(artifact);
        await this.saveTask(task);
        return task;
    }
    /**
     * Get tasks by status
     */
    async getTasksByStatus(projectId, status) {
        const tasks = await this.listTasks(projectId);
        return tasks.filter(t => t.status === status);
    }
    /**
     * Get pending tasks that are not blocked
     */
    async getAvailableTasks(projectId) {
        const tasks = await this.listTasks(projectId);
        return tasks.filter(t => {
            if (t.status !== 'pending') {
                return false;
            }
            // Check if all blockers are completed
            for (const blockerId of t.blockedBy) {
                const blocker = tasks.find(bt => bt.id === blockerId);
                if (blocker && blocker.status !== 'completed') {
                    return false;
                }
            }
            return true;
        });
    }
    /**
     * Delete task
     */
    async deleteTask(projectId, taskId) {
        const fs = await import('fs/promises');
        try {
            await fs.unlink(getTaskFile(projectId, taskId));
            // Remove from blocked tasks
            const task = await this.loadTask(projectId, taskId);
            if (task) {
                for (const blockedId of task.blocks) {
                    const blockedTask = await this.loadTask(projectId, blockedId);
                    if (blockedTask) {
                        blockedTask.blockedBy = blockedTask.blockedBy.filter(id => id !== taskId);
                        await this.saveTask(blockedTask);
                    }
                }
            }
            logger.info('TaskStore', 'Task deleted', { taskId });
            return true;
        }
        catch {
            return false;
        }
    }
}
//# sourceMappingURL=task-store.js.map