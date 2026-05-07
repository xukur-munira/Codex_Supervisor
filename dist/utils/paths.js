/**
 * Path management utilities for MCP Supervisor
 */
import { homedir } from 'os';
import { join } from 'path';
// Default data directory - use Codex's directory for consistency
const DEFAULT_DATA_DIR = join(homedir(), '.codex', 'supervisor');
export function getDataDir() {
    return process.env.CODEX_DATA_DIR || DEFAULT_DATA_DIR;
}
export function getProjectsDir() {
    return join(getDataDir(), 'projects');
}
export function getProjectDir(projectId) {
    return join(getProjectsDir(), projectId);
}
export function getProjectFile(projectId) {
    return join(getProjectDir(projectId), 'project.json');
}
export function getStateFile(projectId) {
    return join(getProjectDir(projectId), 'state.json');
}
export function getTasksDir(projectId) {
    return join(getProjectDir(projectId), 'tasks');
}
export function getTaskFile(projectId, taskId) {
    return join(getTasksDir(projectId), `${taskId}.json`);
}
export function getCheckpointsDir(projectId) {
    return join(getProjectDir(projectId), 'checkpoints');
}
export function getCheckpointFile(projectId, checkpointId) {
    return join(getCheckpointsDir(projectId), `${checkpointId}.json`);
}
export function getMessagesFile(projectId) {
    return join(getProjectDir(projectId), 'messages', 'queue.jsonl');
}
export function getWorkersFile(projectId) {
    return join(getProjectDir(projectId), 'workers.json');
}
export function getWorkersDir(projectId) {
    return join(getProjectDir(projectId), 'workers');
}
export function getWorkerPromptFile(projectId, workerId) {
    return join(getWorkersDir(projectId), `${workerId}.prompt.txt`);
}
export function getWorkerResultFile(projectId, workerId) {
    return join(getWorkersDir(projectId), `${workerId}.result.json`);
}
export function getRuntimeDir() {
    return join(getDataDir(), 'runtime');
}
export function getSessionsDir() {
    return join(getRuntimeDir(), 'sessions');
}
export function getVisualizerStateFile() {
    return join(getRuntimeDir(), 'visualizer.json');
}
export function getDaemonStateFile() {
    return join(getRuntimeDir(), 'daemon.json');
}
export function getWatchdogStateFile() {
    return join(getRuntimeDir(), 'watchdog.json');
}
export function getDaemonLogFile() {
    return join(getRuntimeDir(), 'daemon.log');
}
export function getWatchdogLogFile() {
    return join(getRuntimeDir(), 'watchdog.log');
}
export function getLegacySessionRegistryFile() {
    return join(getRuntimeDir(), 'sessions.json');
}
export function getSessionFile(sessionId) {
    return join(getSessionsDir(), `${sessionId}.json`);
}
export function getBindingsDir() {
    return join(getDataDir(), 'bindings');
}
export function getBindingFile(mainSessionId) {
    return join(getBindingsDir(), `${mainSessionId}.json`);
}
//# sourceMappingURL=paths.js.map