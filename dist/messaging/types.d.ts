/**
 * Message type definitions for MCP Supervisor
 */
export interface BaseMessage {
    id: string;
    timestamp: string;
    projectId: string;
    sessionId: string;
    type?: string;
    source?: string;
    content?: Record<string, unknown>;
}
export interface TaskProgressMessage extends BaseMessage {
    type: 'task_progress';
    taskId: string;
    status: 'started' | 'in_progress' | 'blocked' | 'completed' | 'failed';
    progress: number;
    details: string;
    artifacts?: string[];
}
export interface CheckpointReportMessage extends BaseMessage {
    type: 'checkpoint_report';
    checkpointId: string;
    taskId: string;
    result: 'success' | 'failure' | 'needs_review';
    summary: string;
    codeChanges?: CodeChangeSummary[];
    testResults?: TestResultSummary[];
}
export interface WorkerIdleMessage extends BaseMessage {
    type: 'worker_idle';
    workerId: string;
    completedTaskId?: string;
    availableForTask: boolean;
}
export interface WorkerHeartbeatMessage extends BaseMessage {
    type: 'worker_heartbeat';
    workerId: string;
    status: 'idle' | 'working' | 'blocked';
    currentTaskId?: string;
}
export interface WorkerErrorMessage extends BaseMessage {
    type: 'worker_error';
    workerId: string;
    taskId?: string;
    error: string;
    stack?: string;
}
export interface TaskAssignmentMessage extends BaseMessage {
    type: 'task_assignment';
    taskId: string;
    taskDescription: string;
    taskContext: string;
    priority: number;
    dependencies?: string[];
}
export interface ReviewFeedbackMessage extends BaseMessage {
    type: 'review_feedback';
    checkpointId: string;
    approved: boolean;
    feedback: string;
    requiredChanges?: string[];
}
export interface TerminateMessage extends BaseMessage {
    type: 'terminate';
    reason: string;
    graceful: boolean;
}
export interface TaskBlockMessage extends BaseMessage {
    type: 'task_block';
    taskId: string;
    reason: string;
    blockerTaskId?: string;
}
export interface TaskUnblockMessage extends BaseMessage {
    type: 'task_unblock';
    taskId: string;
}
export interface SystemMessage extends BaseMessage {
    type: 'system';
    subtype: 'project_start' | 'project_pause' | 'project_resume' | 'project_complete';
    payload?: Record<string, unknown>;
}
export interface CodeChangeSummary {
    file: string;
    type: 'created' | 'modified' | 'deleted';
    linesAdded?: number;
    linesRemoved?: number;
}
export interface TestResultSummary {
    suite: string;
    passed: number;
    failed: number;
    skipped: number;
    duration: number;
}
export type SupervisorMessage = TaskProgressMessage | CheckpointReportMessage | WorkerIdleMessage | WorkerHeartbeatMessage | WorkerErrorMessage | TaskAssignmentMessage | ReviewFeedbackMessage | TerminateMessage | TaskBlockMessage | TaskUnblockMessage | SystemMessage;
export type MessageHandler = (message: SupervisorMessage) => void | Promise<void>;
export declare const CHANNELS: {
    PROJECT_PREFIX: string;
    SUPERVISOR_INBOX: string;
    WORKER_INBOX: string;
    BROADCAST: string;
};
export declare function getProjectChannel(projectId: string): string;
export declare function getSupervisorChannel(projectId: string): string;
export declare function getWorkerChannel(workerId: string): string;
//# sourceMappingURL=types.d.ts.map