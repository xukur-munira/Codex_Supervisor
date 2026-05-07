interface DaemonState {
    pid: number;
    port: number;
    startedAt: string;
    restServerPort: number;
    dataDir: string;
}
interface DaemonToolResponse {
    content: Array<{
        type: string;
        text: string;
    }>;
    isError?: boolean;
}
export declare class DaemonClient {
    private state?;
    ensureStarted(): Promise<DaemonState>;
    registerSession(sessionId: string): Promise<{
        sessionId: string;
        createdAt: string;
        workerCount: number;
        projectId?: string;
    }>;
    callTool(sessionId: string, toolName: string, args: Record<string, unknown>): Promise<DaemonToolResponse>;
    private loadState;
    private loadWatchdogState;
    private ensureWatchdogStarted;
    private spawnWatchdog;
    private waitForHealthy;
    private isHealthy;
}
export {};
//# sourceMappingURL=daemon-client.d.ts.map