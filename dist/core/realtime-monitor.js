/**
 * Real-time Monitor Service
 *
 * Monitors main agent's Codex session file and generates monitor agent messages
 */
import Watcher from 'watcher';
import { readFile, readdir } from 'fs/promises';
import { join, basename } from 'path';
import { existsSync } from 'fs';
import { logger } from '../utils/logger.js';
import { MessageLog } from '../persistence/message-log.js';
// Codex sessions directory
const CODEX_SESSIONS_DIR = join(process.env.HOME || process.env.USERPROFILE || '', '.codex', 'sessions');
/**
 * Real-time Monitor Service
 */
export class RealtimeMonitorService {
    bindingManager;
    watchers = new Map(); // mainSessionId -> watcher
    broadcastCallback;
    constructor(bindingManager) {
        this.bindingManager = bindingManager;
    }
    /**
     * Set callback for broadcasting messages to WebSocket
     */
    setBroadcastCallback(callback) {
        this.broadcastCallback = callback;
    }
    /**
     * Start monitoring a main agent session
     */
    async startMonitoring(mainSessionId) {
        const binding = this.bindingManager.getBindingByMainSession(mainSessionId);
        if (!binding) {
            logger.warn('RealtimeMonitorService', 'No binding found for main session', {
                mainSessionId
            });
            return;
        }
        // Find the Codex session file for this main session
        const sessionFile = await this.findCodexSessionFile(mainSessionId);
        if (!sessionFile) {
            logger.warn('RealtimeMonitorService', 'Codex session file not found', {
                mainSessionId
            });
            // Will retry when file appears
            this.watchForSessionFile(mainSessionId);
            return;
        }
        // Start watching the session file for changes
        this.watchSessionFile(sessionFile, binding);
        logger.info('RealtimeMonitorService', 'Monitoring started', {
            mainSessionId,
            monitorSessionId: binding.monitorAgentSessionId,
            sessionFile: basename(sessionFile)
        });
        // Send initial status message
        const initialMsg = {
            id: `monitor-${Date.now()}-init`,
            timestamp: new Date().toISOString(),
            mainSessionId: binding.mainAgentSessionId,
            monitorSessionId: binding.monitorAgentSessionId,
            type: 'status-update',
            source: 'monitor-agent',
            content: {
                message: `监控已启动，正在监督项目 ${binding.projectId} 的执行进度`,
                mainAgentAction: 'session_start'
            }
        };
        await this.saveMonitorMessage(initialMsg, binding.projectId);
        this.broadcastMessage(initialMsg);
    }
    /**
     * Find Codex session file by session ID
     */
    async findCodexSessionFile(sessionId) {
        if (!existsSync(CODEX_SESSIONS_DIR)) {
            return null;
        }
        // Search all .jsonl files for matching session ID
        const files = await this.findAllJsonlFiles(CODEX_SESSIONS_DIR);
        for (const file of files) {
            try {
                const content = await readFile(file, 'utf-8');
                const firstLine = content.split('\n')[0];
                if (firstLine) {
                    const meta = JSON.parse(firstLine);
                    if (meta.type === 'session_meta' && meta.payload?.id === sessionId) {
                        return file;
                    }
                }
            }
            catch (err) {
                // Skip invalid files
            }
        }
        return null;
    }
    /**
     * Find all .jsonl files recursively
     */
    async findAllJsonlFiles(dir) {
        const files = [];
        const entries = await readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = join(dir, entry.name);
            if (entry.isDirectory()) {
                const subFiles = await this.findAllJsonlFiles(fullPath);
                files.push(...subFiles);
            }
            else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
                files.push(fullPath);
            }
        }
        return files;
    }
    /**
     * Watch session file for changes
     */
    watchSessionFile(sessionFile, binding) {
        if (this.watchers.has(binding.mainAgentSessionId)) {
            return; // Already watching
        }
        const watcher = new Watcher(sessionFile, { persistent: false });
        watcher.on('change', async () => {
            logger.info('RealtimeMonitorService', 'Session file changed', {
                file: basename(sessionFile)
            });
            // Read and analyze new content
            await this.analyzeSessionUpdate(sessionFile, binding);
        });
        watcher.on('error', (err) => {
            logger.error('RealtimeMonitorService', 'Watcher error', {
                error: String(err),
                file: basename(sessionFile)
            });
        });
        this.watchers.set(binding.mainAgentSessionId, watcher);
    }
    /**
     * Watch for session file to appear (if not found initially)
     */
    watchForSessionFile(mainSessionId) {
        // Poll every 2 seconds until file appears
        const pollInterval = setInterval(async () => {
            const sessionFile = await this.findCodexSessionFile(mainSessionId);
            if (sessionFile) {
                clearInterval(pollInterval);
                const binding = this.bindingManager.getBindingByMainSession(mainSessionId);
                if (binding) {
                    this.watchSessionFile(sessionFile, binding);
                    logger.info('RealtimeMonitorService', 'Session file found, monitoring started', {
                        mainSessionId,
                        file: basename(sessionFile)
                    });
                }
            }
        }, 2000);
        // Stop polling after 60 seconds if file not found
        setTimeout(() => {
            clearInterval(pollInterval);
            logger.warn('RealtimeMonitorService', 'Session file polling stopped', {
                mainSessionId,
                reason: 'timeout'
            });
        }, 60000);
    }
    /**
     * Analyze session file update and generate monitor messages
     */
    async analyzeSessionUpdate(sessionFile, binding) {
        try {
            const content = await readFile(sessionFile, 'utf-8');
            const lines = content.trim().split('\n');
            // Parse last few messages to understand current action
            const recentMessages = lines.slice(-5).map(line => {
                try {
                    return JSON.parse(line);
                }
                catch {
                    return null;
                }
            }).filter(msg => msg !== null);
            // Generate supervision message based on main agent's last action
            const lastMessage = recentMessages[recentMessages.length - 1];
            if (lastMessage) {
                const monitorMsg = await this.generateMonitorMessage(lastMessage, binding);
                if (monitorMsg) {
                    await this.saveMonitorMessage(monitorMsg, binding.projectId);
                    this.broadcastMessage(monitorMsg);
                }
            }
        }
        catch (err) {
            logger.error('RealtimeMonitorService', 'Failed to analyze session update', {
                error: String(err),
                file: basename(sessionFile)
            });
        }
    }
    /**
     * Generate monitor message based on main agent's action
     */
    async generateMonitorMessage(mainAgentMsg, binding) {
        const msgType = mainAgentMsg.type;
        const payload = mainAgentMsg.payload || {};
        // Supervision logic based on main agent's action
        if (msgType === 'tool_use') {
            const toolName = payload.name || 'unknown';
            return {
                id: `monitor-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                timestamp: new Date().toISOString(),
                mainSessionId: binding.mainAgentSessionId,
                monitorSessionId: binding.monitorAgentSessionId,
                type: 'supervision',
                source: 'monitor-agent',
                content: {
                    message: `主agent正在调用工具 ${toolName}`,
                    mainAgentAction: `tool_call:${toolName}`,
                    supervisionResult: {
                        tool: toolName,
                        status: 'observed',
                        timestamp: mainAgentMsg.timestamp
                    }
                }
            };
        }
        if (msgType === 'response_item' && payload.type === 'tool_result') {
            const toolName = payload.name || 'unknown';
            const isSuccess = !payload.is_error;
            return {
                id: `monitor-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                timestamp: new Date().toISOString(),
                mainSessionId: binding.mainAgentSessionId,
                monitorSessionId: binding.monitorAgentSessionId,
                type: 'supervision',
                source: 'monitor-agent',
                content: {
                    message: isSuccess
                        ? `工具 ${toolName} 执行成功`
                        : `工具 ${toolName} 执行失败，需要干预`,
                    mainAgentAction: `tool_result:${toolName}`,
                    supervisionResult: {
                        tool: toolName,
                        success: isSuccess,
                        needsIntervention: !isSuccess
                    }
                }
            };
        }
        if (msgType === 'event_msg') {
            const eventType = payload.type || 'unknown';
            return {
                id: `monitor-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                timestamp: new Date().toISOString(),
                mainSessionId: binding.mainAgentSessionId,
                monitorSessionId: binding.monitorAgentSessionId,
                type: 'progress-check',
                source: 'monitor-agent',
                content: {
                    message: `主agent状态变化: ${eventType}`,
                    mainAgentAction: `event:${eventType}`,
                    supervisionResult: {
                        eventType,
                        progress: this.extractProgress(eventType, payload)
                    }
                }
            };
        }
        // Skip other message types
        return null;
    }
    /**
     * Extract progress information from event
     */
    extractProgress(eventType, payload) {
        if (eventType === 'task_started')
            return 0;
        if (eventType === 'task_progress')
            return payload.progress || 0;
        if (eventType === 'task_completed')
            return 100;
        return 50; // Default progress
    }
    /**
     * Save monitor message to disk
     */
    async saveMonitorMessage(msg, projectId) {
        try {
            const messageLog = new MessageLog(projectId);
            await messageLog.append({
                id: msg.id,
                timestamp: msg.timestamp,
                projectId: projectId,
                sessionId: msg.mainSessionId,
                type: msg.type,
                source: msg.source,
                content: {
                    ...msg.content,
                    monitorSessionId: msg.monitorSessionId
                }
            });
            logger.info('RealtimeMonitorService', 'Monitor message saved', {
                messageId: msg.id,
                type: msg.type,
                projectId
            });
        }
        catch (err) {
            logger.error('RealtimeMonitorService', 'Failed to save monitor message', {
                error: String(err)
            });
        }
    }
    /**
     * Broadcast message to WebSocket clients
     */
    broadcastMessage(msg) {
        if (this.broadcastCallback) {
            this.broadcastCallback(msg);
        }
    }
    /**
     * Stop monitoring a session
     */
    stopMonitoring(mainSessionId) {
        const watcher = this.watchers.get(mainSessionId);
        if (watcher) {
            watcher.close();
            this.watchers.delete(mainSessionId);
            logger.info('RealtimeMonitorService', 'Monitoring stopped', {
                mainSessionId
            });
        }
    }
    /**
     * Stop all monitoring
     */
    stopAllMonitoring() {
        for (const [mainSessionId, watcher] of this.watchers.entries()) {
            watcher.close();
            logger.info('RealtimeMonitorService', 'Watcher closed', {
                mainSessionId
            });
        }
        this.watchers.clear();
    }
}
//# sourceMappingURL=realtime-monitor.js.map