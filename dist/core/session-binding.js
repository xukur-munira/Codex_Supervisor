/**
 * Session Binding Manager
 *
 * Bindings are shared across MCP server processes, so storing every binding in
 * a single JSON file creates the same overwrite problem as the old session
 * registry. Persist each binding independently and always read fresh data from
 * disk before answering cross-session queries.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, } from 'fs';
import { logger } from '../utils/logger.js';
import { getBindingFile, getBindingsDir } from '../utils/paths.js';
export class SessionBindingManager {
    bindingsDir = getBindingsDir();
    constructor() {
        this.ensureBindingsDir();
    }
    async createBinding(mainAgentSessionId, projectId) {
        const existing = this.getBindingByMainSession(mainAgentSessionId);
        if (existing) {
            return existing;
        }
        const binding = {
            mainAgentSessionId,
            monitorAgentSessionId: `monitor-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
            projectId,
            createdAt: new Date().toISOString(),
            status: 'active',
        };
        await this.saveBinding(binding);
        logger.info('SessionBindingManager', 'Session binding created', {
            mainSession: mainAgentSessionId,
            monitorSession: binding.monitorAgentSessionId,
            projectId,
        });
        return binding;
    }
    getBindingByMainSession(mainAgentSessionId) {
        return this.readBinding(mainAgentSessionId) ?? undefined;
    }
    getBindingByMonitorSession(monitorAgentSessionId) {
        return this.readAllBindings().find(binding => binding.monitorAgentSessionId === monitorAgentSessionId);
    }
    getBindingByProject(projectId) {
        return this.readAllBindings().find(binding => binding.projectId === projectId);
    }
    async updateBindingStatus(mainAgentSessionId, status) {
        const binding = this.getBindingByMainSession(mainAgentSessionId);
        if (!binding) {
            return;
        }
        await this.saveBinding({ ...binding, status });
        logger.info('SessionBindingManager', 'Binding status updated', {
            mainSession: mainAgentSessionId,
            status,
        });
    }
    listActiveBindings() {
        return this.readAllBindings().filter(binding => binding.status === 'active');
    }
    async saveBinding(binding) {
        try {
            this.ensureBindingsDir();
            writeFileSync(getBindingFile(binding.mainAgentSessionId), JSON.stringify(binding, null, 2), 'utf-8');
        }
        catch (err) {
            logger.error('SessionBindingManager', 'Failed to save binding', {
                error: String(err),
                mainSession: binding.mainAgentSessionId,
            });
            throw err;
        }
    }
    /**
     * Backward-compatible entry point used by older call sites. The new storage
     * model persists bindings individually, so there is nothing to flush here.
     */
    async saveBindings() {
        this.ensureBindingsDir();
    }
    ensureBindingsDir() {
        mkdirSync(this.bindingsDir, { recursive: true });
    }
    readBinding(mainAgentSessionId) {
        const file = getBindingFile(mainAgentSessionId);
        if (!existsSync(file)) {
            return null;
        }
        try {
            return JSON.parse(readFileSync(file, 'utf-8'));
        }
        catch (err) {
            logger.warn('SessionBindingManager', 'Failed to read binding', {
                error: String(err),
                mainSession: mainAgentSessionId,
            });
            return null;
        }
    }
    readAllBindings() {
        this.ensureBindingsDir();
        const bindings = [];
        const entries = readdirSync(this.bindingsDir, { withFileTypes: true });
        for (const entry of entries) {
            if (!entry.isFile() || !entry.name.endsWith('.json')) {
                continue;
            }
            const mainSessionId = entry.name.slice(0, -5);
            const binding = this.readBinding(mainSessionId);
            if (binding) {
                bindings.push(binding);
            }
        }
        return bindings;
    }
}
//# sourceMappingURL=session-binding.js.map