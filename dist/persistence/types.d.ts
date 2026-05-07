/**
 * Type definitions for persistence layer
 */
export type TaskStatus = 'pending' | 'assigned' | 'in_progress' | 'blocked' | 'review_pending' | 'review_failed' | 'completed';
export type SupervisorState = 'IDLE' | 'INITIALIZING' | 'PLANNING' | 'SUPERVISING' | 'BLOCKED' | 'REVIEWING' | 'COMPLETING' | 'COMPLETED' | 'ARCHIVED';
export type WorkerStatus = 'spawning' | 'idle' | 'working' | 'blocked' | 'terminated';
export type WorkerType = 'subprocess' | 'virtual';
export interface SessionBinding {
    sessionId: string;
    projectId: string;
    currentTaskId?: string;
    createdAt: string;
    lastActivity: string;
}
export interface Project {
    id: string;
    name: string;
    description: string;
    status: SupervisorState;
    createdAt: string;
    updatedAt: string;
    supervisorConfirmed: boolean;
    workingDirectory: string;
    metadata: Record<string, unknown>;
}
export interface Task {
    id: string;
    projectId: string;
    subject: string;
    description: string;
    status: TaskStatus;
    priority: number;
    blockedBy: string[];
    blocks: string[];
    assignedWorker?: string;
    checkpoints: string[];
    artifacts: Artifact[];
    createdAt: string;
    updatedAt: string;
    startedAt?: string;
    completedAt?: string;
    metadata: Record<string, unknown>;
}
export interface Checkpoint {
    id: string;
    taskId: string;
    projectId: string;
    type: 'pre_task' | 'mid_task' | 'post_task';
    status: 'pending' | 'submitted' | 'approved' | 'rejected';
    summary?: string;
    codeChanges?: CodeChange[];
    testResults?: TestResult[];
    feedback?: string;
    createdAt: string;
    reviewedAt?: string;
}
export interface WorkerSession {
    id: string;
    projectId: string;
    taskId?: string;
    status: WorkerStatus;
    type: WorkerType;
    spawnedAt: string;
    lastHeartbeat: string;
    terminatedAt?: string;
    pid?: number;
    workingDirectory?: string;
    promptFile?: string;
    resultFile?: string;
    lastMessage?: string;
    lastError?: string;
    exitCode?: number | null;
}
export interface CodeChange {
    file: string;
    type: 'created' | 'modified' | 'deleted';
    diff?: string;
}
export interface TestResult {
    suite: string;
    passed: number;
    failed: number;
    skipped: number;
    duration: number;
    output?: string;
}
export interface Artifact {
    type: 'file' | 'directory' | 'command_output';
    path: string;
    description?: string;
}
export interface CompletionCriteria {
    allTasksComplete: boolean;
    allTestsPassing: boolean;
    supervisorConfirmed: boolean;
    noBlockers: boolean;
}
export interface SupervisorStateSnapshot {
    projectId: string;
    state: SupervisorState;
    updatedAt: string;
    activeWorkers: string[];
    pendingTasks: string[];
    blockedTasks: string[];
    completedTasks: string[];
    lastCheckpoint?: string;
}
//# sourceMappingURL=types.d.ts.map