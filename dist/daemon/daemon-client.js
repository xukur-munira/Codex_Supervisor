import { spawn } from 'child_process';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { getDaemonStateFile, getWatchdogStateFile } from '../utils/paths.js';
function getDaemonEntryPath() {
    return resolve(dirname(fileURLToPath(import.meta.url)), '../index.js');
}
function isProcessAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    }
    catch {
        return false;
    }
}
export class DaemonClient {
    state;
    async ensureStarted() {
        await this.ensureWatchdogStarted();
        const existing = await this.loadState();
        if (existing && isProcessAlive(existing.pid) && await this.isHealthy(existing.port)) {
            this.state = existing;
            return existing;
        }
        const started = await this.waitForHealthy();
        this.state = started;
        return started;
    }
    async registerSession(sessionId) {
        const state = await this.ensureStarted();
        const response = await fetch(`http://127.0.0.1:${state.port}/daemon/session/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId }),
        });
        if (!response.ok) {
            throw new Error(`Failed to register session: ${response.status} ${response.statusText}`);
        }
        return await response.json();
    }
    async callTool(sessionId, toolName, args) {
        const state = await this.ensureStarted();
        const response = await fetch(`http://127.0.0.1:${state.port}/daemon/tool-call`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, toolName, args }),
        });
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Daemon tool call failed: ${response.status} ${response.statusText} - ${text}`);
        }
        return await response.json();
    }
    async loadState() {
        const stateFile = getDaemonStateFile();
        if (!existsSync(stateFile)) {
            return null;
        }
        try {
            const content = await readFile(stateFile, 'utf-8');
            return JSON.parse(content);
        }
        catch {
            return null;
        }
    }
    async loadWatchdogState() {
        const stateFile = getWatchdogStateFile();
        if (!existsSync(stateFile)) {
            return null;
        }
        try {
            const content = await readFile(stateFile, 'utf-8');
            return JSON.parse(content);
        }
        catch {
            return null;
        }
    }
    async ensureWatchdogStarted() {
        const watchdog = await this.loadWatchdogState();
        if (watchdog && isProcessAlive(watchdog.pid)) {
            return;
        }
        await this.spawnWatchdog();
    }
    async spawnWatchdog() {
        const child = spawn(process.execPath, [getDaemonEntryPath(), 'watchdog'], {
            cwd: resolve(dirname(fileURLToPath(import.meta.url)), '../..'),
            env: process.env,
            detached: true,
            stdio: 'ignore',
            windowsHide: true,
        });
        child.unref();
    }
    async waitForHealthy(timeoutMs = 15000) {
        const startedAt = Date.now();
        while (Date.now() - startedAt < timeoutMs) {
            const state = await this.loadState();
            if (state && isProcessAlive(state.pid) && await this.isHealthy(state.port)) {
                return state;
            }
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        throw new Error('Timed out waiting for supervisor daemon to become healthy');
    }
    async isHealthy(port) {
        try {
            const response = await fetch(`http://127.0.0.1:${port}/health`);
            return response.ok;
        }
        catch {
            return false;
        }
    }
}
//# sourceMappingURL=daemon-client.js.map