/**
 * MCP stdio bridge.
 *
 * The old implementation owned the supervisor runtime inside the stdio child
 * process. Once Codex/Desktop closed stdin or sent SIGTERM, the same process
 * cleaned up every worker. This bridge now proxies tool calls to a detached
 * daemon so worker execution no longer depends on a single stdio process.
 */
export declare class McpServerSdk {
    private mcpServer;
    private daemonClient;
    private sessionId;
    private sessionInfo?;
    constructor();
    start(): Promise<void>;
    private callTool;
    private registerTools;
    cleanup(): Promise<void>;
}
export declare function runMcpServer(): Promise<void>;
//# sourceMappingURL=mcp-server-sdk.d.ts.map