/**
 * MCP Server Implementation for Codex Supervisor
 * Implements JSON-RPC 2.0 protocol over stdio for MCP compatibility
 */
export declare class McpServer {
    private supervisor;
    private restServer;
    private restServerPort;
    constructor();
    start(): Promise<void>;
    private startRestServerBackground;
    private runMcpProtocol;
    private handleMessage;
    private processRequest;
    private handleInitialize;
    private handleToolCall;
    private sendResponse;
    private cleanup;
}
//# sourceMappingURL=mcp-server.d.ts.map