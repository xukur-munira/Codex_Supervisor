#!/usr/bin/env node
/**
 * Codex Supervisor CLI - Entry Point
 *
 * External Supervisor for OpenAI Codex CLI
 * Manages projects with task decomposition, worker spawning,
 * checkpoint review, and completion verification.
 *
 * Usage:
 *   codex-supervisor serve [--port 3000]
 *   codex-supervisor run --project-dir ./my-project --description "Build a web app"
 *   codex-supervisor status [--project-id ID]
 *   codex-supervisor list
 */
import { RestApiServer } from './api/rest-server.js';
import { Supervisor } from './core/supervisor.js';
import { createMessageQueue } from './messaging/queue.js';
import { ProjectStore } from './persistence/project-store.js';
import { TaskStore } from './persistence/task-store.js';
import { CompletionChecker } from './core/completion-checker.js';
import { checkCodexAvailable } from './session/codex-spawner.js';
import { runMcpServer } from './mcp/mcp-server-sdk.js';
import { runSupervisorDaemon } from './daemon/supervisor-daemon.js';
import { runSupervisorWatchdog } from './daemon/daemon-watchdog.js';
import { resolve } from 'path';
const args = process.argv.slice(2);
const command = args[0];
function printUsage() {
    console.log(`
Codex Supervisor - External Supervisor for OpenAI Codex CLI

Usage:
  codex-supervisor mcp                    Start MCP server (for AI tools integration)
  codex-supervisor daemon                 Start persistent supervisor daemon
  codex-supervisor watchdog               Start watchdog that auto-restarts the daemon
  codex-supervisor serve [--port PORT]   Start REST API server (default: 3000)
  codex-supervisor run [options]          Run supervisor in interactive mode
  codex-supervisor status [--project-id]  Show project status
  codex-supervisor list                   List all projects
  codex-supervisor check [--project-id]   Check completion criteria
  codex-supervisor help                   Show this help

Run options:
  --dir, -d DIR           Project working directory (required)
  --name, -n NAME         Project name
  --desc, -D DESC         Project description (required)
  --tasks TASKS_JSON      Tasks definition as JSON string or file path

Examples:
  codex-supervisor mcp                    # Start MCP bridge (auto-connects daemon)
  codex-supervisor daemon                 # Start persistent supervisor daemon
  codex-supervisor watchdog               # Start watchdog that keeps the daemon alive
  codex-supervisor serve --port 8080      # Start REST API only
  codex-supervisor run -d ./my-app -n "Web App" -D "Build a React web application"
  codex-supervisor status --project-id abc-123
  codex-supervisor list
`);
}
async function cmdServe() {
    const portIndex = args.indexOf('--port');
    const portArg = portIndex !== -1 ? args[portIndex + 1] : undefined;
    const port = portArg
        ? parseInt(portArg, 10)
        : parseInt(process.env.CODEX_PORT || '3000', 10);
    console.log(`Starting Codex Supervisor API on port ${port}...`);
    const server = new RestApiServer(port);
    try {
        await server.start();
    }
    catch (error) {
        const err = error;
        if (err.code === 'EADDRINUSE') {
            console.error(`Error: port ${port} is already in use. Stop the existing process or choose a different port with --port.`);
            process.exit(1);
        }
        throw error;
    }
}
async function cmdRun() {
    // Parse arguments
    let projectDir = '';
    let projectName = '';
    let projectDesc = '';
    let tasksFile = '';
    for (let i = 1; i < args.length; i++) {
        const arg = args[i];
        switch (arg) {
            case '--dir':
            case '-d':
                projectDir = resolve(args[++i] || '');
                break;
            case '--name':
            case '-n':
                projectName = args[++i] || '';
                break;
            case '--desc':
            case '-D':
                projectDesc = args[++i] || '';
                break;
            case '--tasks':
                tasksFile = args[++i] || '';
                break;
        }
    }
    if (!projectDir || !projectDesc) {
        console.error('Error: --dir and --desc are required');
        console.error('Usage: codex-supervisor run --dir ./my-project --desc "Build something"');
        process.exit(1);
    }
    if (!projectName) {
        projectName = projectDir.split(/[\\/]/).pop() || 'unnamed-project';
    }
    // Check Codex CLI availability
    console.log('Checking OpenAI Codex CLI availability...');
    const codexAvailable = await checkCodexAvailable();
    if (!codexAvailable) {
        console.error('Error: OpenAI Codex CLI not found. Please install it first:');
        console.error('  npm install -g @openai/codex');
        process.exit(1);
    }
    console.log('OpenAI Codex CLI: OK');
    // Initialize supervisor
    const messageQueue = createMessageQueue();
    await messageQueue.connect();
    const supervisor = new Supervisor(messageQueue);
    await supervisor.init();
    // Create project
    console.log(`\nCreating project: ${projectName}`);
    const project = await supervisor.startProject(projectName, projectDesc, projectDir);
    console.log(`Project ID: ${project.id}`);
    console.log(`Working Directory: ${projectDir}`);
    // Load tasks if provided
    if (tasksFile) {
        const fs = await import('fs/promises');
        let tasksJson;
        try {
            // Check if it's a file path
            try {
                tasksJson = await fs.readFile(tasksFile, 'utf-8');
            }
            catch {
                // It's a JSON string
                tasksJson = tasksFile;
            }
            const tasks = JSON.parse(tasksJson);
            console.log(`\nDecomposing ${tasks.length} tasks...`);
            const createdTasks = await supervisor.decomposeTasks(project.id, tasks);
            console.log(`Created ${createdTasks.length} tasks:`);
            for (const task of createdTasks) {
                console.log(`  [P${task.priority}] ${task.subject} (${task.status})`);
            }
        }
        catch (error) {
            console.error('Error loading tasks:', error instanceof Error ? error.message : error);
        }
    }
    console.log(`\nProject "${projectName}" started with ID: ${project.id}`);
    console.log(`Data directory: ${process.env.CODEX_DATA_DIR || '~/.claude/supervisor'}`);
    console.log('\nUse the REST API to manage this project:');
    console.log(`  GET  http://localhost:3000/api/projects/${project.id}`);
    console.log(`  POST http://localhost:3000/api/projects/${project.id}/tasks`);
    console.log(`  POST http://localhost:3000/api/projects/${project.id}/workers`);
    console.log('\nOr start the API server: codex-supervisor serve');
}
async function cmdStatus() {
    const projectStore = new ProjectStore();
    const taskStore = new TaskStore();
    const completionChecker = new CompletionChecker();
    const projectIdIndex = args.indexOf('--project-id');
    const projectId = projectIdIndex !== -1 ? args[projectIdIndex + 1] : null;
    if (projectId) {
        const project = await projectStore.loadProject(projectId);
        if (!project) {
            console.error(`Project not found: ${projectId}`);
            process.exit(1);
        }
        const tasks = await taskStore.listTasks(projectId);
        const progress = completionChecker.getProgress(tasks);
        console.log(`\nProject: ${project.name} (${project.id})`);
        console.log(`Status: ${project.status}`);
        console.log(`Description: ${project.description}`);
        console.log(`Working Dir: ${project.workingDirectory}`);
        console.log(`Created: ${project.createdAt}`);
        console.log(`\nProgress: ${progress}%`);
        console.log(`Tasks: ${tasks.length} total`);
        if (tasks.length > 0) {
            const byStatus = new Map();
            for (const task of tasks) {
                byStatus.set(task.status, (byStatus.get(task.status) || 0) + 1);
            }
            console.log('\nTask Status:');
            for (const [status, count] of byStatus) {
                console.log(`  ${status}: ${count}`);
            }
            console.log('\nTask List:');
            for (const task of tasks) {
                const worker = task.assignedWorker ? ` [worker: ${task.assignedWorker.slice(0, 8)}]` : '';
                console.log(`  [P${task.priority}] ${task.subject} - ${task.status}${worker}`);
            }
        }
    }
    else {
        const projects = await projectStore.listProjects();
        if (projects.length === 0) {
            console.log('No projects found.');
            return;
        }
        console.log('\nProjects:');
        for (const project of projects) {
            const tasks = await taskStore.listTasks(project.id);
            const progress = completionChecker.getProgress(tasks);
            console.log(`  ${project.name} (${project.status}) - ${progress}% - ${project.id.slice(0, 8)}`);
        }
    }
}
async function cmdList() {
    const projectStore = new ProjectStore();
    const projects = await projectStore.listProjects();
    if (projects.length === 0) {
        console.log('No projects found.');
        return;
    }
    console.log('\nProjects:');
    for (const project of projects) {
        console.log(`  ${project.name}`);
        console.log(`    ID: ${project.id}`);
        console.log(`    Status: ${project.status}`);
        console.log(`    Description: ${project.description.slice(0, 80)}${project.description.length > 80 ? '...' : ''}`);
        console.log(`    Created: ${project.createdAt}`);
        console.log('');
    }
}
async function cmdCheck() {
    const projectIdIndex = args.indexOf('--project-id');
    const projectId = projectIdIndex !== -1 ? args[projectIdIndex + 1] : null;
    if (!projectId) {
        console.error('Error: --project-id is required');
        process.exit(1);
    }
    const messageQueue = createMessageQueue();
    const supervisor = new Supervisor(messageQueue);
    const result = await supervisor.checkCompletion(projectId);
    console.log(`\nProject: ${projectId}`);
    console.log(`Progress: ${result.progress}%`);
    console.log(`Complete: ${result.isComplete ? 'YES' : 'NO'}`);
    console.log(`\n${result.report}`);
}
async function cmdMcp() {
    await runMcpServer();
}
async function cmdDaemon() {
    await runSupervisorDaemon();
}
async function cmdWatchdog() {
    await runSupervisorWatchdog();
}
// Main entry point
async function main() {
    switch (command) {
        case 'mcp':
            await cmdMcp();
            break;
        case 'daemon':
            await cmdDaemon();
            break;
        case 'watchdog':
            await cmdWatchdog();
            break;
        case 'serve':
            await cmdServe();
            break;
        case 'run':
            await cmdRun();
            break;
        case 'status':
            await cmdStatus();
            break;
        case 'list':
            await cmdList();
            break;
        case 'check':
            await cmdCheck();
            break;
        case 'help':
        case '--help':
        case '-h':
            printUsage();
            break;
        default:
            console.error(`Unknown command: ${command || '(none)'}`);
            printUsage();
            process.exit(1);
    }
}
main().catch((error) => {
    console.error('Fatal error:', error instanceof Error ? error.message : error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map