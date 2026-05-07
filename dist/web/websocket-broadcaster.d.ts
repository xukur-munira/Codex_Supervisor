/**
 * WebSocket Broadcaster for Agent Visualizer
 * Pushes real-time messages to the web UI
 */
interface AgentMessage {
    type: 'tool-call' | 'tool-result' | 'status' | 'progress' | 'error' | 'heartbeat' | 'info';
    source: 'worker' | 'supervisor';
    timestamp: string;
    content: Record<string, unknown>;
}
export declare class AgentVisualizerServer {
    private wss;
    private server;
    private clients;
    private port;
    constructor(port?: number);
    start(): Promise<void>;
    stop(): Promise<void>;
    /** Broadcast message to all connected clients */
    broadcast(message: AgentMessage): void;
    /** Send to specific client */
    private sendToClient;
    /** Helper: Broadcast tool call from worker */
    broadcastWorkerToolCall(tool: string, args: Record<string, unknown>): void;
    /** Helper: Broadcast tool result to worker */
    broadcastSupervisorToolResult(tool: string, result: unknown, error?: string): void;
    /** Helper: Broadcast status update */
    broadcastStatus(data: {
        project?: {
            name: string;
            taskCount: number;
        };
        worker?: {
            id: string;
            taskCount: number;
            progress: number;
        };
        currentTask?: {
            subject: string;
        };
        message?: string;
    }): void;
    /** Helper: Broadcast progress update */
    broadcastProgress(taskSubject: string, status: string, progress: number): void;
    /** Helper: Broadcast error */
    broadcastError(message: string, source?: 'worker' | 'supervisor'): void;
    /** Helper: Broadcast heartbeat */
    broadcastHeartbeat(workerId: string): void;
    /** Get client count */
    getClientCount(): number;
    /** Check if any clients are connected */
    hasClients(): boolean;
}
export declare function getVisualizerServer(port?: number): AgentVisualizerServer;
export {};
//# sourceMappingURL=websocket-broadcaster.d.ts.map