/**
 * REST API Server for Codex Supervisor
 * Provides HTTP endpoints for managing projects, tasks, and workers
 */
export declare class RestApiServer {
    private static visualizerOpened;
    private supervisor;
    private server;
    private wss;
    private wsClients;
    private port;
    private codexReader;
    private bindingManager;
    constructor(port?: number);
    private routes;
    start(): Promise<void>;
    stop(): Promise<void>;
    getPort(): number;
    /** WebSocket helpers */
    private sendToWsClient;
    /** Broadcast to all WebSocket clients */
    broadcastToVisualizer(message: {
        type: 'tool-call' | 'tool-result' | 'status' | 'progress' | 'error' | 'heartbeat' | 'info' | 'supervision' | 'progress-check' | 'task-assignment' | 'checkpoint-review' | 'status-update';
        source: 'worker' | 'supervisor' | 'monitor-agent';
        timestamp: string;
        content: Record<string, unknown>;
    }): void;
    /** Check if visualizer has clients */
    hasVisualizerClients(): boolean;
    /** Global visualizer opened state to prevent infinite popups */
    static isVisualizerOpened(): boolean;
    static setVisualizerOpened(opened: boolean): void;
    private handleRequest;
    private matchPath;
    private parseBody;
    private sendJson;
    private handleCreateProject;
    private handleListProjects;
    private handleGetProject;
    private handleDecomposeTasks;
    private handleListTasks;
    private handleGetTask;
    private handleAssignTask;
    private handleSpawnWorker;
    private handleListWorkers;
    private handleTerminateWorker;
    private handleListCheckpoints;
    private handleReviewCheckpoint;
    private handleCheckCompletion;
    private handleConfirmSupervisor;
    private handleFinalize;
    private handleHealth;
    private handleBroadcast;
    private handleGetMessages;
    private handleGetBinding;
    private handleListBindings;
    private handleListCodexSessions;
    private handleGetCodexSessionMessages;
}
//# sourceMappingURL=rest-server.d.ts.map