/**
 * Checkpoint persistence store
 */
import type { Checkpoint, CodeChange, TestResult } from './types.js';
export declare class CheckpointStore {
    /**
     * Create a new checkpoint
     */
    createCheckpoint(projectId: string, taskId: string, type: Checkpoint['type']): Promise<Checkpoint>;
    /**
     * Save checkpoint
     */
    saveCheckpoint(checkpoint: Checkpoint): Promise<void>;
    /**
     * Load checkpoint by ID
     */
    loadCheckpoint(projectId: string, checkpointId: string): Promise<Checkpoint | null>;
    /**
     * List checkpoints for a task
     */
    listCheckpointsForTask(projectId: string, taskId: string): Promise<Checkpoint[]>;
    /**
     * List all checkpoints for a project
     */
    listCheckpoints(projectId: string): Promise<Checkpoint[]>;
    /**
     * Submit checkpoint with results
     */
    submitCheckpoint(projectId: string, checkpointId: string, summary: string, codeChanges?: CodeChange[], testResults?: TestResult[]): Promise<Checkpoint | null>;
    /**
     * Approve checkpoint
     */
    approveCheckpoint(projectId: string, checkpointId: string): Promise<Checkpoint | null>;
    /**
     * Reject checkpoint with feedback
     */
    rejectCheckpoint(projectId: string, checkpointId: string, feedback: string): Promise<Checkpoint | null>;
    /**
     * Get last checkpoint for a task
     */
    getLastCheckpoint(projectId: string, taskId: string): Promise<Checkpoint | null>;
    /**
     * Get pending checkpoints (submitted but not reviewed)
     */
    getPendingReviewCheckpoints(projectId: string): Promise<Checkpoint[]>;
    /**
     * Delete checkpoint
     */
    deleteCheckpoint(projectId: string, checkpointId: string): Promise<boolean>;
}
//# sourceMappingURL=checkpoint-store.d.ts.map