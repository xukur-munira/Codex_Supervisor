/**
 * Session type definitions
 */
import type { WorkerStatus } from '../persistence/types.js';
export interface SpawnOptions {
    projectId: string;
    taskId?: string;
    agentType?: 'worker' | 'reviewer' | 'tester';
    tools?: string[];
    systemPrompt?: string;
    mcpConfig?: string;
    workingDirectory?: string;
}
export interface WorkerProcess {
    id: string;
    projectId: string;
    taskId?: string;
    status: WorkerStatus;
    type?: 'subprocess' | 'virtual';
    process?: import('child_process').ChildProcess;
    pid?: number;
    workingDirectory?: string;
    promptFile?: string;
    resultFile?: string;
    lastMessage?: string;
    lastError?: string;
    exitCode?: number | null;
    spawnedAt: string;
    lastHeartbeat: string;
    terminatedAt?: string;
    outputBuffer: string[];
    errorBuffer: string[];
}
export interface StreamJsonMessage {
    type: string;
    content?: string;
    tool_calls?: Array<{
        id: string;
        name: string;
        arguments: Record<string, unknown>;
    }>;
    tool_results?: Array<{
        id: string;
        content: string;
        is_error?: boolean;
    }>;
    model?: string;
    usage?: {
        input_tokens: number;
        output_tokens: number;
    };
    stop_reason?: string;
    [key: string]: unknown;
}
//# sourceMappingURL=types.d.ts.map