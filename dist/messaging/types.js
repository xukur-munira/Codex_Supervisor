/**
 * Message type definitions for MCP Supervisor
 */
// Channel definitions
export const CHANNELS = {
    PROJECT_PREFIX: 'codex:project:',
    SUPERVISOR_INBOX: 'codex:supervisor:',
    WORKER_INBOX: 'codex:worker:',
    BROADCAST: 'codex:broadcast',
};
// Queue name helper functions
export function getProjectChannel(projectId) {
    return `${CHANNELS.PROJECT_PREFIX}${projectId}`;
}
export function getSupervisorChannel(projectId) {
    return `${CHANNELS.SUPERVISOR_INBOX}${projectId}`;
}
export function getWorkerChannel(workerId) {
    return `${CHANNELS.WORKER_INBOX}${workerId}`;
}
//# sourceMappingURL=types.js.map