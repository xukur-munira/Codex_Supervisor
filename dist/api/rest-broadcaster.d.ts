/**
 * REST API Broadcaster Client
 * Used when MCP SDK connects to an existing REST server
 * Broadcasts messages via HTTP POST instead of WebSocket
 */
export declare class RestApiBroadcaster {
    private port;
    constructor(port: number);
    hasVisualizerClients(): boolean;
    getVisualizerClientCount(): number;
    broadcastToVisualizer(message: {
        type: 'tool-call' | 'tool-result' | 'status' | 'progress' | 'error' | 'heartbeat' | 'info';
        source: 'worker' | 'supervisor';
        timestamp: string;
        content: Record<string, unknown>;
    }): void;
    stop(): Promise<void>;
}
//# sourceMappingURL=rest-broadcaster.d.ts.map