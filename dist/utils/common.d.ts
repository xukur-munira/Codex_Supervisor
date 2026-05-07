/**
 * Common utilities for MCP Supervisor Server
 */
/**
 * Generate a unique identifier
 */
export declare function generateId(): string;
/**
 * Generate a short ID (first 8 chars of UUID)
 */
export declare function generateShortId(): string;
/**
 * Sleep for specified milliseconds
 */
export declare function sleep(ms: number): Promise<void>;
/**
 * Retry a function with exponential backoff
 */
export declare function retry<T>(fn: () => Promise<T>, maxAttempts?: number, baseDelayMs?: number): Promise<T>;
/**
 * Deep clone an object
 */
export declare function deepClone<T>(obj: T): T;
/**
 * Check if a value is not null or undefined
 */
export declare function isDefined<T>(value: T | null | undefined): value is T;
/**
 * Ensure directory exists (create if needed)
 */
export declare function ensureDir(dir: string): Promise<void>;
/**
 * Read JSON file with error handling
 */
export declare function readJsonFile<T>(filePath: string): Promise<T | null>;
/**
 * Write JSON file atomically
 */
export declare function writeJsonFile<T>(filePath: string, data: T): Promise<void>;
//# sourceMappingURL=common.d.ts.map