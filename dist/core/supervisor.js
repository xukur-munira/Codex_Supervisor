/**
 * Supervisor orchestrator - ties all components together
 */
import { ProjectStore } from '../persistence/project-store.js';
import { TaskStore } from '../persistence/task-store.js';
import { CheckpointStore } from '../persistence/checkpoint-store.js';
import { MessageLog } from '../persistence/message-log.js';
import { SessionLog } from '../persistence/session-log.js';
import { WorkerStore } from '../persistence/worker-store.js';
import { StateMachine } from './state-machine.js';
import { CompletionChecker } from './completion-checker.js';
import { WorkerManager } from '../session/worker-manager.js';
import { getSupervisorChannel, getWorkerChannel, } from '../messaging/types.js';
import { logger } from '../utils/logger.js';
import { getSessionManager } from './session-manager.js';
export class Supervisor {
    projectStore = new ProjectStore();
    taskStore = new TaskStore();
    checkpointStore = new CheckpointStore();
    workerStore = new WorkerStore();
    workerManager;
    completionChecker = new CompletionChecker();
    stateMachines = new Map();
    messageQueues = new Map();
    messageLogs = new Map();
    messageQueue;
    sessionLog = new SessionLog();
    constructor(messageQueue) {
        this.messageQueue = messageQueue;
        this.workerManager = new WorkerManager();
        this.workerManager.setHooks({
            onTaskCompleted: async (worker, result) => {
                if (!worker.taskId) {
                    return;
                }
                const task = await this.taskStore.loadTask(worker.projectId, worker.taskId);
                if (!task) {
                    return;
                }
                if (task.status !== 'review_pending' && task.status !== 'completed') {
                    await this.taskStore.updateStatus(worker.projectId, worker.taskId, 'review_pending');
                }
                let checkpoint = await this.checkpointStore.getLastCheckpoint(worker.projectId, worker.taskId);
                if (!checkpoint || checkpoint.type !== 'post_task' || checkpoint.status === 'approved' || checkpoint.status === 'rejected') {
                    checkpoint = await this.checkpointStore.createCheckpoint(worker.projectId, worker.taskId, 'post_task');
                    await this.taskStore.addCheckpoint(worker.projectId, worker.taskId, checkpoint.id);
                }
                if (checkpoint.status === 'pending') {
                    await this.checkpointStore.submitCheckpoint(worker.projectId, checkpoint.id, result.lastMessage || 'Codex subprocess completed without a summary.');
                }
                await this.saveState(worker.projectId);
            },
            onTaskFailed: async (worker, result) => {
                if (!worker.taskId) {
                    return;
                }
                await this.taskStore.updateStatus(worker.projectId, worker.taskId, 'review_failed');
                await this.saveState(worker.projectId);
            },
        });
        this.workerManager.startHeartbeatMonitor();
    }
    /**
     * Initialize supervisor - connect message queue
     */
    async init() {
        await this.messageQueue.connect();
        await this.restoreRuntimeState();
        logger.info('Supervisor', 'Supervisor initialized');
    }
    hasActiveWorkers() {
        return this.workerManager.listActiveWorkers().length > 0;
    }
    getActiveWorkerCount() {
        return this.workerManager.listActiveWorkers().length;
    }
    getActiveSubprocessWorkerCount() {
        return this.workerManager.getActiveWorkerCount('subprocess');
    }
    getActiveVirtualWorkerCount() {
        return this.workerManager.getActiveWorkerCount('virtual');
    }
    // =========================================
    // Project Management
    // =========================================
    /**
     * Start a new supervised project
     */
    async startProject(name, description, workingDirectory) {
        const project = await this.projectStore.createProject(name, description, workingDirectory);
        // Initialize state machine
        const stateMachine = new StateMachine(project.id);
        stateMachine.transition('start_project');
        this.stateMachines.set(project.id, stateMachine);
        await this.ensureProjectRuntime(project.id);
        logger.info('Supervisor', 'Project started', { projectId: project.id, name });
        return project;
    }
    /**
     * Get project status
     */
    async getProjectStatus(projectId) {
        return this.projectStore.loadProject(projectId);
    }
    /**
     * List all projects
     */
    async listProjects() {
        return this.projectStore.listProjects();
    }
    // =========================================
    // Task Management
    // =========================================
    /**
     * Decompose project into tasks
     */
    async decomposeTasks(projectId, tasks) {
        const stateMachine = this.getStateMachine(projectId);
        const createdTasks = [];
        for (const taskDef of tasks) {
            const task = await this.taskStore.createTask(projectId, taskDef.subject, taskDef.description, taskDef.priority, taskDef.blockedBy);
            createdTasks.push(task);
        }
        // Transition state
        stateMachine.transition('tasks_decomposed');
        await this.saveState(projectId);
        logger.info('Supervisor', 'Tasks decomposed', {
            projectId,
            count: createdTasks.length,
        });
        return createdTasks;
    }
    /**
     * List tasks for a project
     */
    async listTasks(projectId) {
        return this.taskStore.listTasks(projectId);
    }
    /**
     * Get task details
     */
    async getTask(projectId, taskId) {
        return this.taskStore.loadTask(projectId, taskId);
    }
    /**
     * Update task
     */
    async updateTask(projectId, taskId, updates) {
        const task = await this.taskStore.loadTask(projectId, taskId);
        if (!task)
            return null;
        Object.assign(task, updates);
        await this.taskStore.saveTask(task);
        return task;
    }
    // =========================================
    // Worker Management
    // =========================================
    /**
     * Spawn a new worker session (subprocess mode - spawns new Codex CLI)
     */
    async spawnWorker(projectId, options) {
        const project = await this.projectStore.loadProject(projectId);
        if (!project) {
            throw new Error(`Project ${projectId} not found`);
        }
        const worker = this.workerManager.spawn({
            projectId,
            workingDirectory: project.workingDirectory,
            systemPrompt: options?.systemPrompt,
        });
        const stateMachine = this.getStateMachine(projectId);
        // If this is the first worker, transition to SUPERVISING
        const activeWorkers = this.workerManager.listActiveWorkersForProject(projectId);
        if (activeWorkers.length === 1) {
            stateMachine.transition('workers_spawned');
            void this.saveState(projectId);
        }
        logger.info('Supervisor', 'Worker spawned', {
            projectId,
            workerId: worker.id,
        });
        return worker.id;
    }
    /**
     * Spawn a virtual worker (session binding mode)
     * This creates a virtual worker that represents the current session
     * The supervisor will guide the current session through tasks
     * NO subprocess is spawned - it monitors you right now
     */
    spawnVirtualWorker(projectId, sessionId) {
        const sessionManager = getSessionManager();
        if (sessionId) {
            const existingSession = sessionManager.getSession(sessionId);
            const existingWorker = existingSession
                ? Array.from(existingSession.workers.values()).find(worker => worker.type === 'virtual' && worker.status !== 'terminated')
                : undefined;
            if (existingWorker) {
                sessionManager.touchSession(sessionId);
                sessionManager.setProject(sessionId, projectId);
                this.workerManager.restoreWorker({
                    workerId: existingWorker.id,
                    projectId,
                    taskId: existingWorker.currentTaskId,
                    type: existingWorker.type === 'process' ? 'subprocess' : 'virtual',
                    status: existingWorker.status === 'terminated' ? 'idle' : existingWorker.status === 'working' ? 'working' : 'idle',
                });
                logger.info('Supervisor', 'Virtual worker reused for existing session binding', {
                    projectId,
                    workerId: existingWorker.id,
                    sessionId,
                });
                return {
                    workerId: existingWorker.id,
                    sessionId,
                    projectId,
                    reused: true,
                };
            }
        }
        const worker = this.workerManager.spawnVirtual({
            projectId,
        });
        const stateMachine = this.getStateMachine(projectId);
        const activeWorkers = this.workerManager.listActiveWorkersForProject(projectId);
        if (activeWorkers.length === 1) {
            stateMachine.transition('workers_spawned');
            this.saveState(projectId);
        }
        logger.info('Supervisor', 'Virtual worker spawned (session binding mode)', {
            projectId,
            workerId: worker.id,
            sessionId,
        });
        return {
            workerId: worker.id,
            sessionId,
            projectId,
            reused: false,
        };
    }
    /**
     * Refresh heartbeat for virtual worker
     * Call this periodically to show you're still working
     */
    refreshVirtualWorkerHeartbeat(workerId) {
        return this.workerManager.refreshHeartbeat(workerId);
    }
    /**
     * Report task progress from current session (for virtual workers)
     * This is how the current session tells the supervisor what's happening
     */
    async reportTaskProgress(projectId, taskId, status, summary) {
        const stateMachine = this.getStateMachine(projectId);
        const statusMap = {
            started: 'in_progress',
            in_progress: 'in_progress',
            blocked: 'blocked',
            completed: 'review_pending',
            failed: 'review_failed',
        };
        const newStatus = statusMap[status];
        if (newStatus) {
            await this.taskStore.updateStatus(projectId, taskId, newStatus);
        }
        let nextAction;
        if (status === 'completed') {
            // Auto-create checkpoint for review
            await this.checkpointStore.createCheckpoint(projectId, taskId, 'post_task');
            stateMachine.transition('checkpoint_ready');
            nextAction = 'Task completed. A checkpoint has been created for review. Use checkpoint_list to see pending reviews.';
        }
        else if (status === 'blocked') {
            stateMachine.transition('task_blocked');
            nextAction = 'Task is blocked. Use task_list to see what dependencies need to be resolved first.';
        }
        else if (status === 'in_progress') {
            nextAction = 'Task is in progress. Continue working on it.';
        }
        await this.saveState(projectId);
        logger.info('Supervisor', 'Task progress reported', {
            projectId,
            taskId,
            status,
            summary,
        });
        return { success: true, nextAction };
    }
    /**
     * Get the next task to work on (for session binding mode)
     * Returns the highest priority available task
     */
    async getNextTask(projectId) {
        const availableTasks = await this.taskStore.getAvailableTasks(projectId);
        if (availableTasks.length === 0) {
            return null;
        }
        return availableTasks[0] ?? null;
    }
    /**
     * Get guidance for what to do next (for session binding mode)
     * This helps the current session know what task to pick up
     */
    async getGuidance(projectId) {
        const tasks = await this.taskStore.listTasks(projectId);
        const progress = this.completionChecker.getProgress(tasks);
        // Find current task (in progress)
        const currentTask = tasks.find(t => t.status === 'in_progress');
        // Find next available task
        const nextTask = await this.getNextTask(projectId);
        let message;
        if (currentTask) {
            message = `Currently working on: "${currentTask.subject}". Continue with this task. Status: ${progress}% complete.`;
        }
        else if (nextTask) {
            message = `Next task to pick up: "${nextTask.subject}" (Priority ${nextTask.priority}). Description: ${nextTask.description}. Status: ${progress}% complete.`;
        }
        else if (progress === 100) {
            message = `All tasks completed! Progress: ${progress}%. Ready for final review and confirmation.`;
        }
        else {
            const blockedTasks = tasks.filter(t => t.status === 'blocked');
            if (blockedTasks.length > 0) {
                message = `All remaining tasks are blocked. Check dependencies: ${blockedTasks.map(t => t.subject).join(', ')}`;
            }
            else {
                message = `No available tasks. Progress: ${progress}%. Some tasks may be pending review.`;
            }
        }
        return {
            currentTask: currentTask ?? undefined,
            nextTask: nextTask ?? undefined,
            message,
            progress,
        };
    }
    // =========================================
    // Session Handover (Context Transfer)
    // =========================================
    /**
     * Export session for handover to new session
     * When current session context is exhausted, export and create new session
     */
    async exportSession(projectId, sessionId, includeHandoverPrompt = false) {
        // Export session summary
        const summary = await this.sessionLog.exportSession(projectId, sessionId);
        // Export to markdown file
        const markdownFile = await this.sessionLog.exportToMarkdown(projectId, sessionId);
        // Optionally generate handover prompt
        let handoverPrompt;
        if (includeHandoverPrompt) {
            handoverPrompt = await this.sessionLog.generateHandoverPrompt(projectId, sessionId);
        }
        logger.info('Supervisor', 'Session exported for handover', {
            projectId,
            sessionId,
            progress: summary.progress,
            markdownFile,
        });
        return { summary, markdownFile, handoverPrompt };
    }
    /**
     * Assign a task to a worker
     */
    async assignTask(projectId, taskId, workerId) {
        const task = await this.taskStore.assignWorker(projectId, taskId, workerId);
        if (!task)
            return null;
        // Send task assignment message to worker
        const channel = getWorkerChannel(workerId);
        await this.messageQueue.publish(channel, {
            type: 'task_assignment',
            id: '',
            timestamp: new Date().toISOString(),
            projectId,
            sessionId: workerId,
            taskId,
            taskDescription: task.description,
            taskContext: task.subject,
            priority: task.priority,
            dependencies: task.blockedBy,
        });
        // Update worker status
        const worker = this.workerManager.getWorker(workerId);
        if (worker) {
            worker.status = 'working';
            worker.taskId = taskId;
        }
        // Update task status
        await this.taskStore.updateStatus(projectId, taskId, 'in_progress');
        const started = this.workerManager.sendTask(workerId, `${task.subject}\n\n${task.description}`);
        if (!started) {
            await this.taskStore.updateStatus(projectId, taskId, 'review_failed');
            if (worker) {
                worker.status = 'blocked';
            }
            throw new Error(`Failed to start worker ${workerId} for task ${taskId}`);
        }
        logger.info('Supervisor', 'Task assigned', {
            projectId,
            taskId,
            workerId,
        });
        return task;
    }
    /**
     * List active workers for a project
     */
    async listWorkers(projectId) {
        await this.restorePersistedWorkers(projectId);
        const sessionWorkers = getSessionManager()
            .findSessionByProject(projectId)
            .flatMap(session => Array.from(session.workers.values())
            .filter(worker => worker.status !== 'terminated')
            .map(worker => this.workerManager.restoreWorker({
            workerId: worker.id,
            projectId,
            taskId: worker.currentTaskId,
            type: worker.type === 'process' ? 'subprocess' : 'virtual',
            status: worker.status === 'working' ? 'working' : 'idle',
        })));
        const workers = new Map();
        for (const worker of this.workerManager.listWorkersForProject(projectId)) {
            workers.set(worker.id, worker);
        }
        for (const worker of sessionWorkers) {
            workers.set(worker.id, worker);
        }
        return Array.from(workers.values()).map(w => ({
            id: w.id,
            projectId: w.projectId,
            taskId: w.taskId,
            status: w.status,
            pid: w.pid,
            spawnedAt: w.spawnedAt,
            lastHeartbeat: w.lastHeartbeat,
        }));
    }
    /**
     * Terminate a worker
     */
    terminateWorker(workerId, graceful = true) {
        return this.workerManager.terminate(workerId, graceful);
    }
    // =========================================
    // Checkpoint Management
    // =========================================
    /**
     * Create a checkpoint
     */
    async createCheckpoint(projectId, taskId, type) {
        const checkpoint = await this.checkpointStore.createCheckpoint(projectId, taskId, type);
        await this.taskStore.addCheckpoint(projectId, taskId, checkpoint.id);
        return checkpoint;
    }
    /**
     * Review a checkpoint (approve or reject)
     */
    async reviewCheckpoint(projectId, checkpointId, approved, feedback) {
        const stateMachine = this.getStateMachine(projectId);
        let checkpoint;
        if (approved) {
            checkpoint = await this.checkpointStore.approveCheckpoint(projectId, checkpointId);
            stateMachine.transition('review_approved');
            // Notify worker
            const checkpointData = await this.checkpointStore.loadCheckpoint(projectId, checkpointId);
            if (checkpointData) {
                const workerChannel = getWorkerChannel(checkpointData.taskId);
                await this.messageQueue.publish(workerChannel, {
                    type: 'review_feedback',
                    id: '',
                    timestamp: new Date().toISOString(),
                    projectId,
                    sessionId: checkpointData.taskId,
                    checkpointId,
                    approved: true,
                    feedback: feedback || 'Approved',
                });
            }
        }
        else {
            checkpoint = await this.checkpointStore.rejectCheckpoint(projectId, checkpointId, feedback || 'Needs revision');
            stateMachine.transition('review_done');
            // Notify worker with feedback
            const checkpointData = await this.checkpointStore.loadCheckpoint(projectId, checkpointId);
            if (checkpointData) {
                const workerChannel = getWorkerChannel(checkpointData.taskId);
                await this.messageQueue.publish(workerChannel, {
                    type: 'review_feedback',
                    id: '',
                    timestamp: new Date().toISOString(),
                    projectId,
                    sessionId: checkpointData.taskId,
                    checkpointId,
                    approved: false,
                    feedback: feedback || '',
                });
            }
        }
        await this.saveState(projectId);
        return checkpoint;
    }
    /**
     * Get pending review checkpoints
     */
    async getPendingCheckpoints(projectId) {
        return this.checkpointStore.getPendingReviewCheckpoints(projectId);
    }
    // =========================================
    // Completion
    // =========================================
    /**
     * Check project completion criteria
     */
    async checkCompletion(projectId) {
        const project = await this.projectStore.loadProject(projectId);
        if (!project) {
            throw new Error(`Project ${projectId} not found`);
        }
        const tasks = await this.taskStore.listTasks(projectId);
        const checkpoints = await this.checkpointStore.listCheckpoints(projectId);
        const criteria = await this.completionChecker.checkCriteria(tasks, checkpoints, project.supervisorConfirmed);
        const isComplete = this.completionChecker.isProjectComplete(criteria);
        const report = this.completionChecker.getCompletionReport(criteria);
        const progress = this.completionChecker.getProgress(tasks);
        return { criteria, isComplete, report, progress };
    }
    /**
     * Confirm supervisor approval
     */
    async confirmSupervisor(projectId) {
        const project = await this.projectStore.confirmSupervisor(projectId);
        if (project) {
            // Check if all criteria now met
            const { isComplete } = await this.checkCompletion(projectId);
            if (isComplete) {
                const stateMachine = this.getStateMachine(projectId);
                stateMachine.transition('all_criteria_met');
                await this.projectStore.updateStatus(projectId, 'COMPLETED');
            }
        }
        return project;
    }
    /**
     * Finalize and archive project
     */
    async finalizeProject(projectId) {
        const stateMachine = this.getStateMachine(projectId);
        stateMachine.transition('finalize');
        // Terminate all workers
        this.workerManager.terminateAllForProject(projectId, true);
        // Archive project
        await this.projectStore.archiveProject(projectId);
        logger.info('Supervisor', 'Project finalized', { projectId });
    }
    // =========================================
    // Message Handling
    // =========================================
    /**
     * Handle incoming messages from workers
     */
    async handleMessage(projectId, message) {
        const stateMachine = this.getStateMachine(projectId);
        const messageLog = this.messageLogs.get(projectId);
        // Log the message
        if (messageLog) {
            await messageLog.append(message);
        }
        switch (message.type) {
            case 'task_progress':
                await this.handleTaskProgress(projectId, message, stateMachine);
                break;
            case 'checkpoint_report':
                await this.handleCheckpointReport(projectId, message, stateMachine);
                break;
            case 'worker_idle':
                await this.handleWorkerIdle(projectId, message, stateMachine);
                break;
            case 'worker_error':
                await this.handleWorkerError(projectId, message, stateMachine);
                break;
            default:
                logger.debug('Supervisor', 'Unhandled message type', { type: message.type });
        }
    }
    /**
     * Handle task progress message
     */
    async handleTaskProgress(projectId, message, stateMachine) {
        const task = await this.taskStore.loadTask(projectId, message.taskId);
        if (!task)
            return;
        // Map message status to task status
        const statusMap = {
            started: 'in_progress',
            in_progress: 'in_progress',
            blocked: 'blocked',
            completed: 'review_pending',
            failed: 'review_failed',
        };
        const newStatus = statusMap[message.status];
        if (newStatus) {
            await this.taskStore.updateStatus(projectId, message.taskId, newStatus);
        }
        if (message.status === 'completed') {
            // Create a post_task checkpoint for review
            await this.checkpointStore.createCheckpoint(projectId, message.taskId, 'post_task');
            stateMachine.transition('checkpoint_ready');
            await this.saveState(projectId);
        }
        if (message.status === 'blocked') {
            stateMachine.transition('task_blocked');
            await this.saveState(projectId);
        }
    }
    /**
     * Handle checkpoint report message
     */
    async handleCheckpointReport(projectId, message, stateMachine) {
        await this.checkpointStore.submitCheckpoint(projectId, message.checkpointId, message.summary, message.codeChanges, message.testResults);
        // Transition to reviewing
        stateMachine.transition('checkpoint_ready');
        await this.saveState(projectId);
    }
    /**
     * Handle worker idle message - auto-assign next available task
     */
    async handleWorkerIdle(projectId, message, stateMachine) {
        if (!message.availableForTask)
            return;
        // Get next available task
        const availableTasks = await this.taskStore.getAvailableTasks(projectId);
        if (availableTasks.length > 0) {
            // Assign the highest priority available task
            const nextTask = availableTasks[0];
            await this.assignTask(projectId, nextTask.id, message.workerId);
        }
    }
    /**
     * Handle worker error message
     */
    async handleWorkerError(projectId, message, stateMachine) {
        logger.error('Supervisor', 'Worker reported error', {
            workerId: message.workerId,
            taskId: message.taskId,
            error: message.error,
        });
        // Mark task as failed if there was an assigned task
        if (message.taskId) {
            await this.taskStore.updateStatus(projectId, message.taskId, 'review_failed');
        }
    }
    // =========================================
    // Internal Helpers
    // =========================================
    getStateMachine(projectId) {
        let sm = this.stateMachines.get(projectId);
        if (!sm) {
            sm = new StateMachine(projectId);
            this.stateMachines.set(projectId, sm);
        }
        return sm;
    }
    async saveState(projectId) {
        const stateMachine = this.getStateMachine(projectId);
        const tasks = await this.taskStore.listTasks(projectId);
        const snapshot = {
            projectId,
            state: stateMachine.getState(),
            updatedAt: new Date().toISOString(),
            activeWorkers: this.workerManager.listActiveWorkersForProject(projectId).map(w => w.id),
            pendingTasks: tasks.filter(t => t.status === 'pending').map(t => t.id),
            blockedTasks: tasks.filter(t => t.status === 'blocked').map(t => t.id),
            completedTasks: tasks.filter(t => t.status === 'completed').map(t => t.id),
        };
        await this.projectStore.saveState(projectId, snapshot);
    }
    async restoreRuntimeState() {
        const projects = await this.projectStore.listProjects();
        for (const project of projects) {
            await this.ensureProjectRuntime(project.id);
            await this.restorePersistedWorkers(project.id);
        }
    }
    async ensureProjectRuntime(projectId) {
        if (!this.messageLogs.has(projectId)) {
            this.messageLogs.set(projectId, new MessageLog(projectId));
        }
        if (this.messageQueues.has(projectId)) {
            return;
        }
        const channel = getSupervisorChannel(projectId);
        await this.messageQueue.subscribe(channel, async (msg) => {
            await this.handleMessage(projectId, msg);
        });
        this.messageQueues.set(projectId, this.messageQueue);
    }
    // =========================================
    // Tool Call Handler (used by MCP Server)
    // =========================================
    /**
     * Handle MCP tool calls
     */
    async handleToolCall(toolName, args) {
        try {
            let result;
            switch (toolName) {
                // Project tools
                case 'supervisor_start_project':
                    result = await this.startProject(args.name, args.description, args.workingDirectory);
                    break;
                case 'supervisor_get_status':
                    result = await this.getProjectStatus(args.projectId);
                    break;
                case 'supervisor_list_projects':
                    result = await this.listProjects();
                    break;
                // Task tools
                case 'task_decompose':
                    result = await this.decomposeTasks(args.projectId, args.tasks);
                    break;
                case 'task_list':
                    result = await this.listTasks(args.projectId);
                    break;
                case 'task_get':
                    result = await this.getTask(args.projectId, args.taskId);
                    break;
                case 'task_assign':
                    result = await this.assignTask(args.projectId, args.taskId, args.workerId);
                    break;
                // Worker tools
                case 'worker_spawn':
                    result = await this.spawnWorker(args.projectId, {
                        systemPrompt: args.systemPrompt,
                    });
                    break;
                case 'worker_spawn_virtual': {
                    const sessionId = typeof args.sessionId === 'string' ? args.sessionId : undefined;
                    result = this.spawnVirtualWorker(args.projectId, sessionId);
                    break;
                }
                case 'worker_heartbeat':
                    // Refresh heartbeat for virtual worker
                    result = this.refreshVirtualWorkerHeartbeat(args.workerId);
                    break;
                case 'task_report_progress':
                    // Report progress from current session (for virtual workers)
                    result = await this.reportTaskProgress(args.projectId, args.taskId, args.status, args.summary);
                    break;
                case 'worker_list':
                    result = await this.listWorkers(args.projectId);
                    break;
                case 'worker_terminate':
                    result = this.terminateWorker(args.workerId, args.graceful);
                    break;
                // Checkpoint tools
                case 'checkpoint_review':
                    result = await this.reviewCheckpoint(args.projectId, args.checkpointId, args.approved, args.feedback);
                    break;
                case 'checkpoint_list':
                    result = await this.checkpointStore.getPendingReviewCheckpoints(args.projectId);
                    break;
                // Completion tools
                case 'project_check_completion':
                    result = await this.checkCompletion(args.projectId);
                    break;
                case 'project_confirm_supervisor':
                    result = await this.confirmSupervisor(args.projectId);
                    break;
                case 'project_finalize':
                    await this.finalizeProject(args.projectId);
                    result = { success: true };
                    break;
                // Session binding tools
                case 'supervisor_get_guidance':
                    result = await this.getGuidance(args.projectId);
                    break;
                // Session handover tools
                case 'session_export':
                    result = await this.exportSession(args.projectId, args.sessionId, args.includeHandoverPrompt);
                    break;
                case 'session_get_handover_prompt':
                    result = await this.sessionLog.generateHandoverPrompt(args.projectId, args.sessionId);
                    break;
                default:
                    return {
                        content: [{ type: 'text', text: `Unknown tool: ${toolName}` }],
                        isError: true,
                    };
            }
            return {
                content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error('Supervisor', `Tool call failed: ${toolName}`, { error: errorMessage });
            return {
                content: [{ type: 'text', text: `Error: ${errorMessage}` }],
                isError: true,
            };
        }
    }
    /**
     * Cleanup all resources
     */
    async cleanup(options) {
        const terminateWorkers = options?.terminateWorkers ?? true;
        const graceful = options?.graceful ?? false;
        this.workerManager.stopHeartbeatMonitor();
        if (terminateWorkers) {
            this.workerManager.terminateAll(graceful);
        }
        await this.messageQueue.disconnect();
    }
    async restorePersistedWorkers(projectId) {
        const persistedWorkers = await this.workerStore.listWorkers(projectId);
        const project = await this.projectStore.loadProject(projectId);
        if (!project) {
            return;
        }
        for (const worker of persistedWorkers) {
            if (worker.status === 'terminated') {
                continue;
            }
            const restored = this.workerManager.restoreWorker({
                workerId: worker.id,
                projectId,
                taskId: worker.taskId,
                workingDirectory: worker.workingDirectory || project.workingDirectory,
                type: worker.type === 'virtual' ? 'virtual' : 'subprocess',
                status: worker.status === 'working' ? 'working' : 'idle',
                pid: worker.pid,
                promptFile: worker.promptFile,
                resultFile: worker.resultFile,
                lastMessage: worker.lastMessage,
                lastError: worker.lastError,
                exitCode: worker.exitCode,
                spawnedAt: worker.spawnedAt,
                lastHeartbeat: worker.lastHeartbeat,
                terminatedAt: worker.terminatedAt,
            });
            if (restored.type === 'subprocess') {
                await this.workerManager.reconcileWorker(restored.id);
            }
        }
    }
}
//# sourceMappingURL=supervisor.js.map