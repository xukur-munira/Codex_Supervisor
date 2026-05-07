/**
 * Logger utility for MCP Supervisor Server
 * All output goes to stderr so it doesn't interfere with MCP stdout protocol
 */
export declare const logger: {
    debug: (category: string, message: string, data?: unknown) => void;
    info: (category: string, message: string, data?: unknown) => void;
    warn: (category: string, message: string, data?: unknown) => void;
    error: (category: string, message: string, data?: unknown) => void;
};
//# sourceMappingURL=logger.d.ts.map