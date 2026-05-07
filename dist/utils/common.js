/**
 * Common utilities for MCP Supervisor Server
 */
import { randomUUID } from 'crypto';
/**
 * Generate a unique identifier
 */
export function generateId() {
    return randomUUID();
}
/**
 * Generate a short ID (first 8 chars of UUID)
 */
export function generateShortId() {
    return randomUUID().slice(0, 8);
}
/**
 * Sleep for specified milliseconds
 */
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
/**
 * Retry a function with exponential backoff
 */
export async function retry(fn, maxAttempts = 3, baseDelayMs = 1000) {
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        }
        catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            if (attempt < maxAttempts) {
                const delay = baseDelayMs * Math.pow(2, attempt - 1);
                await sleep(delay);
            }
        }
    }
    throw lastError;
}
/**
 * Deep clone an object
 */
export function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}
/**
 * Check if a value is not null or undefined
 */
export function isDefined(value) {
    return value !== null && value !== undefined;
}
/**
 * Ensure directory exists (create if needed)
 */
export async function ensureDir(dir) {
    const fs = await import('fs/promises');
    try {
        await fs.mkdir(dir, { recursive: true });
    }
    catch {
        // Directory already exists or created
    }
}
/**
 * Read JSON file with error handling
 */
export async function readJsonFile(filePath) {
    const fs = await import('fs/promises');
    try {
        const content = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(content);
    }
    catch {
        return null;
    }
}
/**
 * Write JSON file atomically
 */
export async function writeJsonFile(filePath, data) {
    const fs = await import('fs/promises');
    const content = JSON.stringify(data, null, 2);
    await fs.writeFile(filePath, content, 'utf-8');
}
//# sourceMappingURL=common.js.map