/**
 * JSON stream parser for Claude CLI --output-format stream-json
 */
import type { StreamJsonMessage } from './types.js';
export interface JsonStreamParser {
    parse(chunk: string): StreamJsonMessage[];
    flush(): StreamJsonMessage[];
}
export declare function createJsonStreamParser(): JsonStreamParser;
//# sourceMappingURL=stream-parser.d.ts.map