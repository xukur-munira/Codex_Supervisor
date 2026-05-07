/**
 * Task persistence store
 */
import type { Task, TaskStatus } from './types.js';
export declare class TaskStore {
    /**
     * Create a new task
     */
    createTask(projectId: string, subject: string, description: string, priority?: number, blockedBy?: string[], metadata?: Record<string, unknown>): Promise<Task>;
    /**
     * Save task
     */
    saveTask(task: Task): Promise<void>;
    /**
     * Load task by ID
     */
    loadTask(projectId: string, taskId: string): Promise<Task | null>;
    /**
     * List all tasks for a project
     */
    listTasks(projectId: string): Promise<Task[]>;
    /**
     * Update task status
     */
    updateStatus(projectId: string, taskId: string, status: TaskStatus): Promise<Task | null>;
    /**
     * Assign worker to task
     */
    assignWorker(projectId: string, taskId: string, workerId: string): Promise<Task | null>;
    /**
     * Unassign worker from task
     */
    unassignWorker(projectId: string, taskId: string): Promise<Task | null>;
    /**
     * Add checkpoint to task
     */
    addCheckpoint(projectId: string, taskId: string, checkpointId: string): Promise<Task | null>;
    /**
     * Add artifact to task
     */
    addArtifact(projectId: string, taskId: string, artifact: Task['artifacts'][0]): Promise<Task | null>;
    /**
     * Get tasks by status
     */
    getTasksByStatus(projectId: string, status: TaskStatus): Promise<Task[]>;
    /**
     * Get pending tasks that are not blocked
     */
    getAvailableTasks(projectId: string): Promise<Task[]>;
    /**
     * Delete task
     */
    deleteTask(projectId: string, taskId: string): Promise<boolean>;
}
//# sourceMappingURL=task-store.d.ts.map