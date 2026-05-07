/**
 * Completion checker - evaluates whether project completion criteria are met
 */
import { logger } from '../utils/logger.js';
export class CompletionChecker {
    /**
     * Check all completion criteria for a project
     */
    async checkCriteria(tasks, checkpoints, supervisorConfirmed) {
        const criteria = {
            allTasksComplete: this.checkAllTasksComplete(tasks),
            allTestsPassing: this.checkAllTestsPassing(checkpoints),
            supervisorConfirmed,
            noBlockers: this.checkNoBlockers(tasks),
        };
        logger.info('CompletionChecker', 'Criteria check result', criteria);
        return criteria;
    }
    /**
     * Check if all tasks are completed
     */
    checkAllTasksComplete(tasks) {
        if (tasks.length === 0) {
            return false;
        }
        return tasks.every(t => t.status === 'completed');
    }
    /**
     * Check if all tests are passing based on last checkpoint results
     */
    checkAllTestsPassing(checkpoints) {
        // Find the latest post_task checkpoints with test results
        const postTaskCheckpoints = checkpoints
            .filter(c => c.type === 'post_task' && c.testResults && c.testResults.length > 0)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        if (postTaskCheckpoints.length === 0) {
            // No test results available yet - not blocking, but not confirming either
            return true;
        }
        // Check the latest test results
        const latestCheckpoint = postTaskCheckpoints[0];
        const testResults = latestCheckpoint?.testResults ?? [];
        const totalFailed = testResults.reduce((sum, tr) => sum + tr.failed, 0);
        return totalFailed === 0;
    }
    /**
     * Check if there are no blocked tasks
     */
    checkNoBlockers(tasks) {
        return !tasks.some(t => t.status === 'blocked');
    }
    /**
     * Determine if the project is complete
     */
    isProjectComplete(criteria) {
        return (criteria.allTasksComplete &&
            criteria.allTestsPassing &&
            criteria.supervisorConfirmed &&
            criteria.noBlockers);
    }
    /**
     * Get a human-readable completion status report
     */
    getCompletionReport(criteria) {
        const lines = ['Completion Criteria Report:', '---'];
        lines.push(`Tasks Complete: ${criteria.allTasksComplete ? 'PASS' : 'FAIL'}`);
        lines.push(`Tests Passing: ${criteria.allTestsPassing ? 'PASS' : 'FAIL'}`);
        lines.push(`Supervisor Confirmed: ${criteria.supervisorConfirmed ? 'PASS' : 'FAIL'}`);
        lines.push(`No Blockers: ${criteria.noBlockers ? 'PASS' : 'FAIL'}`);
        lines.push('---');
        if (this.isProjectComplete(criteria)) {
            lines.push('Overall: PROJECT COMPLETE');
        }
        else {
            lines.push('Overall: INCOMPLETE');
            const failures = [];
            if (!criteria.allTasksComplete)
                failures.push('Not all tasks completed');
            if (!criteria.allTestsPassing)
                failures.push('Some tests failing');
            if (!criteria.supervisorConfirmed)
                failures.push('Supervisor has not confirmed');
            if (!criteria.noBlockers)
                failures.push('There are blocked tasks');
            lines.push(`Remaining: ${failures.join(', ')}`);
        }
        return lines.join('\n');
    }
    /**
     * Get progress percentage
     */
    getProgress(tasks) {
        if (tasks.length === 0) {
            return 0;
        }
        const completed = tasks.filter(t => t.status === 'completed').length;
        return Math.round((completed / tasks.length) * 100);
    }
}
//# sourceMappingURL=completion-checker.js.map