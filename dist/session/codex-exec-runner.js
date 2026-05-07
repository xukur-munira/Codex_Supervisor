import { spawn } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname } from 'path';
const CODEX_CLI = process.env.CODEX_CLI_PATH || 'codex';
function getLastMessageFile(resultFile) {
    return resultFile.replace(/\.result\.json$/i, '.last-message.txt');
}
function toPowerShellLiteral(value) {
    return `'${value.replace(/'/g, "''")}'`;
}
function resolveCodexInvocation(args, promptFile) {
    if (process.platform !== 'win32') {
        return { command: CODEX_CLI, args, shell: false };
    }
    const psArgsLiteral = args.map(arg => toPowerShellLiteral(arg)).join(', ');
    const command = [
        `$prompt = Get-Content -Raw -LiteralPath ${toPowerShellLiteral(promptFile)};`,
        `$codexArgs = @(${psArgsLiteral});`,
        '$prompt | & codex @codexArgs',
    ].join(' ');
    return {
        command: 'powershell.exe',
        args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
        shell: false,
    };
}
function parsePayload() {
    const payloadIndex = process.argv.indexOf('--payload');
    if (payloadIndex === -1 || !process.argv[payloadIndex + 1]) {
        throw new Error('Missing --payload for codex exec runner');
    }
    const encoded = process.argv[payloadIndex + 1];
    const json = Buffer.from(encoded, 'base64url').toString('utf-8');
    return JSON.parse(json);
}
function buildExecArgs(payload) {
    const lastMessageFile = getLastMessageFile(payload.resultFile);
    const args = [
        'exec',
        '--json',
        '--ephemeral',
        '--skip-git-repo-check',
        '--cd',
        payload.workingDirectory,
        '--sandbox',
        process.env.CODEX_SANDBOX_MODE || 'workspace-write',
        '--disable',
        'plugins',
        '-o',
        lastMessageFile,
        '-c',
        'mcp_servers={}',
        '-c',
        'features={}',
    ];
    if (payload.agentType === 'reviewer') {
        args.push('--model', 'o3');
    }
    else if (payload.agentType === 'tester') {
        args.push('--model', 'gpt-4.1');
    }
    if (process.env.CODEX_USE_SANDBOX === 'false') {
        args.push('--dangerously-bypass-approvals-and-sandbox');
    }
    else {
        args.push('--full-auto');
    }
    args.push('-');
    return args;
}
async function writeResult(file, result) {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(result, null, 2), 'utf-8');
}
function writeResultSync(file, result) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(result, null, 2), 'utf-8');
}
async function main() {
    const payload = parsePayload();
    const prompt = await readFile(payload.promptFile, 'utf-8');
    const args = buildExecArgs(payload);
    const lastMessageFile = getLastMessageFile(payload.resultFile);
    const startedAt = new Date().toISOString();
    const stderrLines = [];
    let completionObserved = false;
    let lastMessage = '';
    const result = {
        workerId: payload.workerId,
        projectId: payload.projectId,
        taskId: payload.taskId,
        status: 'running',
        startedAt,
        updatedAt: startedAt,
    };
    const invocation = resolveCodexInvocation(args, payload.promptFile);
    const child = spawn(invocation.command, invocation.args, {
        cwd: payload.workingDirectory,
        env: process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: invocation.shell,
        windowsHide: true,
    });
    result.codexPid = child.pid ?? undefined;
    await writeResult(payload.resultFile, result);
    child.stdin.write(prompt);
    child.stdin.end();
    child.stdout.on('data', (chunk) => {
        const lines = chunk.toString('utf-8').split(/\r?\n/).filter(Boolean);
        for (const line of lines) {
            try {
                const event = JSON.parse(line);
                if (event.type === 'item.completed' && event.item?.type === 'agent_message' && typeof event.item.text === 'string') {
                    lastMessage = event.item.text;
                    result.lastMessage = lastMessage;
                }
                if (event.type === 'turn.completed' && !completionObserved) {
                    completionObserved = true;
                    result.status = 'completed';
                    result.exitCode = 0;
                    result.finishedAt = new Date().toISOString();
                    result.updatedAt = result.finishedAt;
                    result.lastMessage = lastMessage || result.lastMessage;
                    result.stderrTail = [...stderrLines];
                    writeResultSync(payload.resultFile, result);
                    try {
                        child.kill('SIGTERM');
                        setTimeout(() => {
                            if (child.exitCode === null) {
                                child.kill('SIGKILL');
                            }
                        }, 5000).unref?.();
                    }
                    catch {
                        // ignore kill failures
                    }
                    return;
                }
            }
            catch {
                // ignore non-json stdout
            }
        }
        result.updatedAt = new Date().toISOString();
        writeResultSync(payload.resultFile, result);
    });
    child.stderr.on('data', async (chunk) => {
        const lines = chunk.toString('utf-8').split(/\r?\n/).filter(Boolean);
        stderrLines.push(...lines);
        while (stderrLines.length > 40) {
            stderrLines.shift();
        }
        result.stderrTail = [...stderrLines];
        result.updatedAt = new Date().toISOString();
        writeResultSync(payload.resultFile, result);
    });
    child.on('error', (error) => {
        result.status = 'failed';
        result.error = error.message;
        result.exitCode = null;
        result.finishedAt = new Date().toISOString();
        result.updatedAt = result.finishedAt;
        result.stderrTail = [...stderrLines];
        writeResultSync(payload.resultFile, result);
        process.exit(1);
    });
    child.on('close', (code) => {
        if (!completionObserved) {
            result.status = code === 0 ? 'completed' : 'failed';
            result.exitCode = code;
            result.finishedAt = new Date().toISOString();
            result.updatedAt = result.finishedAt;
            try {
                if (existsSync(lastMessageFile)) {
                    result.lastMessage = readFileSync(lastMessageFile, 'utf-8').trim();
                }
            }
            catch {
                // ignore missing last message file
            }
            result.stderrTail = [...stderrLines];
            if (code !== 0 && !result.error) {
                result.error = stderrLines[stderrLines.length - 1] || `codex exec exited with code ${code}`;
            }
            writeResultSync(payload.resultFile, result);
        }
        process.exit(completionObserved ? 0 : (code ?? 1));
    });
}
main().catch(async (error) => {
    const payloadArgIndex = process.argv.indexOf('--payload');
    if (payloadArgIndex !== -1 && process.argv[payloadArgIndex + 1]) {
        try {
            const payload = parsePayload();
            await writeResult(payload.resultFile, {
                workerId: payload.workerId,
                projectId: payload.projectId,
                taskId: payload.taskId,
                status: 'failed',
                startedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                finishedAt: new Date().toISOString(),
                error: error instanceof Error ? error.message : String(error),
            });
        }
        catch {
            // ignore nested failure
        }
    }
    process.exit(1);
});
//# sourceMappingURL=codex-exec-runner.js.map