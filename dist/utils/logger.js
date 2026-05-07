/**
 * Logger utility for MCP Supervisor Server
 * All output goes to stderr so it doesn't interfere with MCP stdout protocol
 */
const LOG_LEVELS = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};
const currentLevel = process.env.CODEX_LOG_LEVEL || 'info';
function formatTimestamp() {
    return new Date().toISOString();
}
function log(level, category, message, data) {
    if (LOG_LEVELS[level] < LOG_LEVELS[currentLevel]) {
        return;
    }
    const timestamp = formatTimestamp();
    const prefix = `[${timestamp}] [${level.toUpperCase()}] [${category}]`;
    if (data !== undefined) {
        console.error(`${prefix} ${message}`, JSON.stringify(data, null, 2));
    }
    else {
        console.error(`${prefix} ${message}`);
    }
}
export const logger = {
    debug: (category, message, data) => log('debug', category, message, data),
    info: (category, message, data) => log('info', category, message, data),
    warn: (category, message, data) => log('warn', category, message, data),
    error: (category, message, data) => log('error', category, message, data),
};
//# sourceMappingURL=logger.js.map