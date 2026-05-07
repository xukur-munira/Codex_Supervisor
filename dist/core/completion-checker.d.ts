/**
 * Completion checker - evaluates whether project completion criteria are met
 */
import type { Task, CompletionCriteria } from '../persistence/types.js';
import type { Checkpoint } from '../persistence/types.js';
export declare class CompletionChecker {
    /**
     * Check all completion criteria for a project
     */
    checkCriteria(tasks: Task[], checkpoints: Checkpoint[], supervisorConfirmed: boolean): Promise<CompletionCriteria>;
    /**
     * Check if all tasks are completed
     */
    checkAllTasksComplete(tasks: Task[]): boolean;
    /**
     * Check if all tests are passing based on last checkpoint results
     */
    checkAllTestsPassing(checkpoints: Checkpoint[]): boolean;
    /**
     * Check if there are no blocked tasks
     */
    checkNoBlockers(tasks: Task[]): boolean;
    /**
     * Determine if the project is complete
     */
    isProjectComplete(criteria: CompletionCriteria): boolean;
    /**
     * Get a human-readable completion status report
     */
    getCompletionReport(criteria: CompletionCriteria): string;
    /**
     * Get progress percentage
     */
    getProgress(tasks: Task[]): number;
}
//# sourceMappingURL=completion-checker.d.ts.map