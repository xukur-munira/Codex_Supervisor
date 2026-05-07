/**
 * Session Log - Export/Import session context for handover
 *
 * When current session context is exhausted, we can:
 * 1. Export session summary to a markdown file
 * 2. Create new session with the summary injected
 * 3. Continue supervising the new session
 */
export interface SessionSummary {
    projectId: string;
    projectName: string;
    projectDescription: string;
    workingDirectory: string;
    exportedAt: string;
    fromSessionId: string;
    completedTasks: Array<{
        id: string;
        subject: string;
        description: string;
        completedAt: string;
        keyOutputs: string[];
    }>;
    currentTask?: {
        id: string;
        subject: string;
        description: string;
        status: string;
        progressSummary: string;
        remainingWork: string;
    };
    pendingTasks: Array<{
        id: string;
        subject: string;
        description: string;
        priority: number;
        blockedBy: string[];
    }>;
    keyDecisions: string[];
    importantContext: string[];
    codeChangesSummary: string;
    progress: number;
}
export declare class SessionLog {
    private projectStore;
    private taskStore;
    private checkpointStore;
    exportSession(projectId: string, sessionId: string): Promise<SessionSummary>;
    exportToMarkdown(projectId: string, sessionId: string): Promise<string>;
    private formatAsMarkdown;
    private extractKeyOutputs;
    private extractProgressSummary;
    private extractRemainingWork;
    private extractKeyDecisions;
    private extractImportantContext;
    private extractCodeChangesSummary;
    generateHandoverPrompt(projectId: string, sessionId: string): Promise<string>;
}
//# sourceMappingURL=session-log.d.ts.map