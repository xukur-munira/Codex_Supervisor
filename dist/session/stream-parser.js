/**
 * JSON stream parser for Claude CLI --output-format stream-json
 */
export function createJsonStreamParser() {
    let buffer = '';
    return {
        parse(chunk) {
            buffer += chunk;
            const lines = buffer.split('\n');
            const messages = [];
            // Keep the last incomplete line in the buffer
            buffer = lines.pop() || '';
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed)
                    continue;
                try {
                    const parsed = JSON.parse(trimmed);
                    messages.push(parsed);
                }
                catch {
                    // Non-JSON line (e.g., progress output) - skip
                }
            }
            return messages;
        },
        flush() {
            const messages = [];
            if (buffer.trim()) {
                try {
                    const parsed = JSON.parse(buffer.trim());
                    messages.push(parsed);
                }
                catch {
                    // Ignore unparseable remaining buffer
                }
            }
            buffer = '';
            return messages;
        },
    };
}
//# sourceMappingURL=stream-parser.js.map