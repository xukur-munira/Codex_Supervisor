/**
 * Resource registry - defines all MCP resources for the supervisor server
 */
export const resources = [
    {
        uri: 'codex://projects',
        name: 'All Projects',
        description: 'List of all supervised projects',
        mimeType: 'application/json',
    },
    {
        uri: 'codex://projects/{projectId}',
        name: 'Project Details',
        description: 'Detailed information about a specific project',
        mimeType: 'application/json',
    },
    {
        uri: 'codex://projects/{projectId}/tasks',
        name: 'Project Tasks',
        description: 'All tasks for a specific project',
        mimeType: 'application/json',
    },
    {
        uri: 'codex://workers',
        name: 'Active Workers',
        description: 'All active worker sessions across projects',
        mimeType: 'application/json',
    },
];
//# sourceMappingURL=index.js.map