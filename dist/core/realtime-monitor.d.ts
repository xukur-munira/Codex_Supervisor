/**
 * Real-time Monitor Service
 *
 * Monitors main agent's Codex session file and generates monitor agent messages
 */
import { SessionBindingManager } from './session-binding.js';
export interface MonitorMessage {
    id: string;
    timestamp: string;
    mainSessionId: string;
    monitorSessionId: string;
    type: 'supervision' | 'progress-check' | 'task-assignment' | 'checkpoint-review' | 'status-update';
    source: 'monitor-agent';
    content: {
        message: string;
        mainAgentAction?: string;
        supervisionResult?: any;
    };
}
/**
 * Real-time Monitor Service
 */
export declare class RealtimeMonitorService {
    private bindingManager;
    private watchers;
    private broadcastCallback?;
    constructor(bindingManager: SessionBindingManager);
    /**
     * Set callback for broadcasting messages to WebSocket
     */
    setBroadcastCallback(callback: (msg: MonitorMessage) => void): void;
    /**
     * Start monitoring a main agent session
     */
    startMonitoring(mainSessionId: string): Promise<void>;
    /**
     * Find Codex session file by session ID
     */
    private findCodexSessionFile;
    /**
     * Find all .jsonl files recursively
     */
    private findAllJsonlFiles;
    /**
     * Watch session file for changes
     */
    private watchSessionFile;
    /**
     * Watch for session file to appear (if not found initially)
     */
    private watchForSessionFile;
    /**
     * Analyze session file update and generate monitor messages
     */
    private analyzeSessionUpdate;
    /**
     * Generate monitor message based on main agent's action
     */
    private generateMonitorMessage;
    /**
     * Extract progress information from event
     */
    private extractProgress;
    /**
     * Save monitor message to disk
     */
    private saveMonitorMessage;
    /**
     * Broadcast message to WebSocket clients
     */
    private broadcastMessage;
    /**
     * Stop monitoring a session
     */
    stopMonitoring(mainSessionId: string): void;
    /**
     * Stop all monitoring
     */
    stopAllMonitoring(): void;
}
//# sourceMappingURL=realtime-monitor.d.ts.map