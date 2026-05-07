export declare class SupervisorDaemon {
    private supervisor;
    private sessionManager;
    private bindingManager;
    private monitorService;
    private restServer;
    private restServerPort;
    private controlPort;
    private controlServer;
    private transportDisconnectGraceMs;
    constructor();
    start(): Promise<void>;
    stop(): Promise<void>;
    private startRestServerBackground;
    private startControlServer;
    private persistState;
    private handleRequest;
    private parseBody;
    private sendJson;
    private callTool;
}
export declare function runSupervisorDaemon(): Promise<void>;
//# sourceMappingURL=supervisor-daemon.d.ts.map