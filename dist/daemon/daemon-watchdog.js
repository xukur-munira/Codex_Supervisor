import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { getDaemonStateFile, getWatchdogStateFile } from '../utils/paths.js';
import { logger } from '../utils/logger.js';
function isProcessAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    }
    catch {
        return false;
    }
}
function getTimeoutMs(envValue, fallbackMs) {
    const parsed = Number(envValue);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallbackMs;
    }
    return parsed;
}
function getDaemonEntryPath() {
    return resolve(dirname(fileURLToPath(import.meta.url)), '../index.js');
}
export class DaemonWatchdog {
    monitorIntervalMs = getTimeoutMs(process.env.CODEX_DAEMON_WATCHDOG_INTERVAL_MS, 5000);
    monitorTimer;
    async start() {
        await this.persistState();
        await this.ensureDaemonRunning();
        this.monitorTimer = setInterval(async () => {
            try {
                await this.ensureDaemonRunning();
            }
            catch (error) {
                logger.error('DaemonWatchdog', 'Failed while ensuring daemon is running', {
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }, this.monitorIntervalMs);
        logger.info('DaemonWatchdog', 'Watchdog started', {
            monitorIntervalMs: this.monitorIntervalMs,
        });
    }
    async stop() {
        if (this.monitorTimer) {
            clearInterval(this.monitorTimer);
            this.monitorTimer = undefined;
        }
    }
    async ensureDaemonRunning() {
        const daemonState = await this.loadDaemonState();
        if (daemonState && isProcessAlive(daemonState.pid) && await this.isHealthy(daemonState.port)) {
            return;
        }
        logger.warn('DaemonWatchdog', 'Daemon missing or unhealthy, respawning');
        await this.spawnDaemon();
    }
    async spawnDaemon() {
        const child = spawn(process.execPath, [getDaemonEntryPath(), 'daemon'], {
            cwd: resolve(dirname(fileURLToPath(import.meta.url)), '../..'),
            env: process.env,
            detached: true,
            stdio: 'ignore',
            windowsHide: true,
        });
        child.unref();
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
    async loadDaemonState() {
        const file = getDaemonStateFile();
        if (!existsSync(file)) {
            return null;
        }
        try {
            const content = await readFile(file, 'utf-8');
            return JSON.parse(content);
        }
        catch {
            return null;
        }
    }
    async persistState() {
        const state = {
            pid: process.pid,
            startedAt: new Date().toISOString(),
            monitorIntervalMs: this.monitorIntervalMs,
            dataDir: process.env.CODEX_DATA_DIR || '',
        };
        const file = getWatchdogStateFile();
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, JSON.stringify(state, null, 2), 'utf-8');
    }
}
export async function runSupervisorWatchdog() {
    const watchdog = new DaemonWatchdog();
    process.on('SIGINT', async () => {
        await watchdog.stop();
        process.exit(0);
    });
    process.on('SIGTERM', async () => {
        await watchdog.stop();
        process.exit(0);
    });
    await watchdog.start();
}
//# sourceMappingURL=daemon-watchdog.js.map