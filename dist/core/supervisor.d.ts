/**
 * Supervisor orchestrator - ties all components together
 */
import type { MessageQueue } from '../messaging/queue.js';
import type { Project, Task, Checkpoint } from '../persistence/types.js';
export declare class Supervisor {
    private projectStore;
    private taskStore;
    private checkpointStore;
    private workerStore;
    private workerManager;
    private completionChecker;
    private stateMachines;
    private messageQueues;
    private messageLogs;
    private messageQueue;
    private sessionLog;
    constructor(messageQueue: MessageQueue);
    /**
     * Initialize supervisor - connect message queue
     */
    init(): Promise<void>;
    hasActiveWorkers(): boolean;
    getActiveWorkerCount(): number;
    getActiveSubprocessWorkerCount(): number;
    getActiveVirtualWorkerCount(): number;
    /**
     * Start a new supervised project
     */
    startProject(name: string, description: string, workingDirectory: string): Promise<Project>;
    /**
     * Get project status
     */
    getProjectStatus(projectId: string): Promise<Project | null>;
    /**
     * List all projects
     */
    listProjects(): Promise<Project[]>;
    /**
     * Decompose project into tasks
     */
    decomposeTasks(projectId: string, tasks: Array<{
        subject: string;
        description: string;
        priority?: number;
        blockedBy?: string[];
    }>): Promise<Task[]>;
    /**
     * List tasks for a project
     */
    listTasks(projectId: string): Promise<Task[]>;
    /**
     * Get task details
     */
    getTask(projectId: string, taskId: string): Promise<Task | null>;
    /**
     * Update task
     */
    updateTask(projectId: string, taskId: string, updates: Partial<Task>): Promise<Task | null>;
    /**
     * Spawn a new worker session (subprocess mode - spawns new Codex CLI)
     */
    spawnWorker(projectId: string, options?: {
        systemPrompt?: string;
    }): Promise<string>;
    /**
     * Spawn a virtual worker (session binding mode)
     * This creates a virtual worker that represents the current session
     * The supervisor will guide the current session through tasks
     * NO subprocess is spawned - it monitors you right now
     */
    spawnVirtualWorker(projectId: string, sessionId?: string): {
        workerId: string;
        sessionId?: string;
        projectId: string;
        reused: boolean;
    };
    /**
     * Refresh heartbeat for virtual worker
     * Call this periodically to show you're still working
     */
    refreshVirtualWorkerHeartbeat(workerId: string): boolean;
    /**
     * Report task progress from current session (for virtual workers)
     * This is how the current session tells the supervisor what's happening
     */
    reportTaskProgress(projectId: string, taskId: string, status: string, summary?: string): Promise<{
        success: boolean;
        nextAction?: string;
    }>;
    /**
     * Get the next task to work on (for session binding mode)
     * Returns the highest priority available task
     */
    getNextTask(projectId: string): Promise<Task | null>;
    /**
     * Get guidance for what to do next (for session binding mode)
     * This helps the current session know what task to pick up
     */
    getGuidance(projectId: string): Promise<{
        currentTask?: Task;
        nextTask?: Task;
        message: string;
        progress: number;
    }>;
    /**
     * Export session for handover to new session
     * When current session context is exhausted, export and create new session
     */
    exportSession(projectId: string, sessionId: string, includeHandoverPrompt?: boolean): Promise<{
        summary: import('../persistence/session-log.js').SessionSummary;
        markdownFile: string;
        handoverPrompt?: string;
    }>;
    /**
     * Assign a task to a worker
     */
    assignTask(projectId: string, taskId: string, workerId: string): Promise<Task | null>;
    /**
     * List active workers for a project
     */
    listWorkers(projectId: string): Promise<{
        id: string;
        projectId: string;
        taskId: string | undefined;
        status: import("../persistence/types.js").WorkerStatus;
        pid: number | undefined;
        spawnedAt: string;
        lastHeartbeat: string;
    }[]>;
    /**
     * Terminate a worker
     */
    terminateWorker(workerId: string, graceful?: boolean): boolean;
    /**
     * Create a checkpoint
     */
    createCheckpoint(projectId: string, taskId: string, type: Checkpoint['type']): Promise<Checkpoint>;
    /**
     * Review a checkpoint (approve or reject)
     */
    reviewCheckpoint(projectId: string, checkpointId: string, approved: boolean, feedback?: string): Promise<Checkpoint | null>;
    /**
     * Get pending review checkpoints
     */
    getPendingCheckpoints(projectId: string): Promise<Checkpoint[]>;
    /**
     * Check project completion criteria
     */
    checkCompletion(projectId: string): Promise<{
        criteria: import('../persistence/types.js').CompletionCriteria;
        isComplete: boolean;
        report: string;
        progress: number;
    }>;
    /**
     * Confirm supervisor approval
     */
    confirmSupervisor(projectId: string): Promise<Project | null>;
    /**
     * Finalize and archive project
     */
    finalizeProject(projectId: string): Promise<void>;
    /**
     * Handle incoming messages from workers
     */
    private handleMessage;
    /**
     * Handle task progress message
     */
    private handleTaskProgress;
    /**
     * Handle checkpoint report message
     */
    private handleCheckpointReport;
    /**
     * Handle worker idle message - auto-assign next available task
     */
    private handleWorkerIdle;
    /**
     * Handle worker error message
     */
    private handleWorkerError;
    private getStateMachine;
    private saveState;
    private restoreRuntimeState;
    private ensureProjectRuntime;
    /**
     * Handle MCP tool calls
     */
    handleToolCall(toolName: string, args: Record<string, unknown>): Promise<{
        content: Array<{
            type: string;
            text: string;
        }>;
        isError?: boolean;
    }>;
    /**
     * Cleanup all resources
     */
    cleanup(options?: {
        terminateWorkers?: boolean;
        graceful?: boolean;
    }): Promise<void>;
    private restorePersistedWorkers;
}
//# sourceMappingURL=supervisor.d.ts.map