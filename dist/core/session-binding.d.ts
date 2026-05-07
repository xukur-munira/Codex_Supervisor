/**
 * Session Binding Manager
 *
 * Bindings are shared across MCP server processes, so storing every binding in
 * a single JSON file creates the same overwrite problem as the old session
 * registry. Persist each binding independently and always read fresh data from
 * disk before answering cross-session queries.
 */
export interface SessionBinding {
    mainAgentSessionId: string;
    monitorAgentSessionId: string;
    projectId: string;
    createdAt: string;
    status: 'active' | 'completed' | 'failed';
}
export declare class SessionBindingManager {
    private bindingsDir;
    constructor();
    createBinding(mainAgentSessionId: string, projectId: string): Promise<SessionBinding>;
    getBindingByMainSession(mainAgentSessionId: string): SessionBinding | undefined;
    getBindingByMonitorSession(monitorAgentSessionId: string): SessionBinding | undefined;
    getBindingByProject(projectId: string): SessionBinding | undefined;
    updateBindingStatus(mainAgentSessionId: string, status: 'active' | 'completed' | 'failed'): Promise<void>;
    listActiveBindings(): SessionBinding[];
    saveBinding(binding: SessionBinding): Promise<void>;
    /**
     * Backward-compatible entry point used by older call sites. The new storage
     * model persists bindings individually, so there is nothing to flush here.
     */
    saveBindings(): Promise<void>;
    private ensureBindingsDir;
    private readBinding;
    private readAllBindings;
}
//# sourceMappingURL=session-binding.d.ts.map