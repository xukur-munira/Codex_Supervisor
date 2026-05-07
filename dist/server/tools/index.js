/**
 * Tool registry - defines all MCP tools for the supervisor server
 */
export const tools = [
    // Project Management
    {
        name: 'supervisor_start_project',
        description: 'Start a new supervised project. Creates a project with supervisor tracking, task management, and worker session coordination.',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Short project name',
                },
                description: {
                    type: 'string',
                    description: 'Detailed project description including goals and requirements',
                },
                workingDirectory: {
                    type: 'string',
                    description: 'Absolute path to the project working directory',
                },
            },
            required: ['name', 'description', 'workingDirectory'],
        },
    },
    {
        name: 'supervisor_get_status',
        description: 'Get the current status of a supervised project including supervisor state, task progress, and worker activity.',
        inputSchema: {
            type: 'object',
            properties: {
                projectId: {
                    type: 'string',
                    description: 'Project ID',
                },
            },
            required: ['projectId'],
        },
    },
    {
        name: 'supervisor_list_projects',
        description: 'List all supervised projects with their current status.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
    },
    // Task Management
    {
        name: 'task_decompose',
        description: 'Break down a project into tasks with priorities and dependencies. Each task has a subject, description, priority (1-10), and optional list of blocker task IDs.',
        inputSchema: {
            type: 'object',
            properties: {
                projectId: {
                    type: 'string',
                    description: 'Project ID',
                },
                tasks: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            subject: {
                                type: 'string',
                                description: 'Brief task title',
                            },
                            description: {
                                type: 'string',
                                description: 'Detailed task requirements',
                            },
                            priority: {
                                type: 'number',
                                description: 'Priority 1-10 (lower = higher priority)',
                                minimum: 1,
                                maximum: 10,
                            },
                            blockedBy: {
                                type: 'array',
                                items: { type: 'string' },
                                description: 'Task IDs that must complete before this task',
                            },
                        },
                        required: ['subject', 'description'],
                    },
                    description: 'Array of task definitions',
                },
            },
            required: ['projectId', 'tasks'],
        },
    },
    {
        name: 'task_list',
        description: 'List all tasks for a project, sorted by priority.',
        inputSchema: {
            type: 'object',
            properties: {
                projectId: {
                    type: 'string',
                    description: 'Project ID',
                },
            },
            required: ['projectId'],
        },
    },
    {
        name: 'task_get',
        description: 'Get detailed information about a specific task.',
        inputSchema: {
            type: 'object',
            properties: {
                projectId: {
                    type: 'string',
                    description: 'Project ID',
                },
                taskId: {
                    type: 'string',
                    description: 'Task ID',
                },
            },
            required: ['projectId', 'taskId'],
        },
    },
    {
        name: 'task_assign',
        description: 'Assign a task to a worker session. The worker will receive a task_assignment message via the message queue.',
        inputSchema: {
            type: 'object',
            properties: {
                projectId: {
                    type: 'string',
                    description: 'Project ID',
                },
                taskId: {
                    type: 'string',
                    description: 'Task ID to assign',
                },
                workerId: {
                    type: 'string',
                    description: 'Worker session ID to assign the task to',
                },
            },
            required: ['projectId', 'taskId', 'workerId'],
        },
    },
    // Worker Management
    {
        name: 'worker_spawn',
        description: 'Spawn a new worker Claude Code session for the project. The worker will listen for task assignments via the message queue.',
        inputSchema: {
            type: 'object',
            properties: {
                projectId: {
                    type: 'string',
                    description: 'Project ID',
                },
                systemPrompt: {
                    type: 'string',
                    description: 'Optional custom system prompt for the worker',
                },
            },
            required: ['projectId'],
        },
    },
    {
        name: 'worker_list',
        description: 'List all worker sessions for a project with their status.',
        inputSchema: {
            type: 'object',
            properties: {
                projectId: {
                    type: 'string',
                    description: 'Project ID',
                },
            },
            required: ['projectId'],
        },
    },
    {
        name: 'worker_terminate',
        description: 'Terminate a worker session. Use graceful=true to allow the worker to finish current work before terminating.',
        inputSchema: {
            type: 'object',
            properties: {
                workerId: {
                    type: 'string',
                    description: 'Worker session ID to terminate',
                },
                graceful: {
                    type: 'boolean',
                    description: 'Whether to allow graceful termination (default: true)',
                    default: true,
                },
            },
            required: ['workerId'],
        },
    },
    // Checkpoint Management
    {
        name: 'checkpoint_review',
        description: 'Review a checkpoint submission from a worker. Approve to accept the work, or reject with feedback to request revisions.',
        inputSchema: {
            type: 'object',
            properties: {
                projectId: {
                    type: 'string',
                    description: 'Project ID',
                },
                checkpointId: {
                    type: 'string',
                    description: 'Checkpoint ID to review',
                },
                approved: {
                    type: 'boolean',
                    description: 'Whether to approve the checkpoint',
                },
                feedback: {
                    type: 'string',
                    description: 'Review feedback (required if rejecting)',
                },
            },
            required: ['projectId', 'checkpointId', 'approved'],
        },
    },
    {
        name: 'checkpoint_list',
        description: 'List all checkpoints pending review for a project.',
        inputSchema: {
            type: 'object',
            properties: {
                projectId: {
                    type: 'string',
                    description: 'Project ID',
                },
            },
            required: ['projectId'],
        },
    },
    // Completion
    {
        name: 'project_check_completion',
        description: 'Check if all completion criteria are met for a project. Returns criteria status, progress percentage, and a detailed report.',
        inputSchema: {
            type: 'object',
            properties: {
                projectId: {
                    type: 'string',
                    description: 'Project ID',
                },
            },
            required: ['projectId'],
        },
    },
    {
        name: 'project_confirm_supervisor',
        description: 'Confirm supervisor approval for the project. This is one of the completion criteria.',
        inputSchema: {
            type: 'object',
            properties: {
                projectId: {
                    type: 'string',
                    description: 'Project ID',
                },
            },
            required: ['projectId'],
        },
    },
    {
        name: 'project_finalize',
        description: 'Finalize and archive the project. Terminates all workers and archives project data.',
        inputSchema: {
            type: 'object',
            properties: {
                projectId: {
                    type: 'string',
                    description: 'Project ID',
                },
            },
            required: ['projectId'],
        },
    },
];
//# sourceMappingURL=index.js.map