export declare class DaemonWatchdog {
    private monitorIntervalMs;
    private monitorTimer?;
    start(): Promise<void>;
    stop(): Promise<void>;
    private ensureDaemonRunning;
    private spawnDaemon;
    private isHealthy;
    private loadDaemonState;
    private persistState;
}
export declare function runSupervisorWatchdog(): Promise<void>;
//# sourceMappingURL=daemon-watchdog.d.ts.map