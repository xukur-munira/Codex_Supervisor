/**
 * Path management utilities for MCP Supervisor
 */
export declare function getDataDir(): string;
export declare function getProjectsDir(): string;
export declare function getProjectDir(projectId: string): string;
export declare function getProjectFile(projectId: string): string;
export declare function getStateFile(projectId: string): string;
export declare function getTasksDir(projectId: string): string;
export declare function getTaskFile(projectId: string, taskId: string): string;
export declare function getCheckpointsDir(projectId: string): string;
export declare function getCheckpointFile(projectId: string, checkpointId: string): string;
export declare function getMessagesFile(projectId: string): string;
export declare function getWorkersFile(projectId: string): string;
export declare function getWorkersDir(projectId: string): string;
export declare function getWorkerPromptFile(projectId: string, workerId: string): string;
export declare function getWorkerResultFile(projectId: string, workerId: string): string;
export declare function getRuntimeDir(): string;
export declare function getSessionsDir(): string;
export declare function getVisualizerStateFile(): string;
export declare function getDaemonStateFile(): string;
export declare function getWatchdogStateFile(): string;
export declare function getDaemonLogFile(): string;
export declare function getWatchdogLogFile(): string;
export declare function getLegacySessionRegistryFile(): string;
export declare function getSessionFile(sessionId: string): string;
export declare function getBindingsDir(): string;
export declare function getBindingFile(mainSessionId: string): string;
//# sourceMappingURL=paths.d.ts.map