/**
 * Session Log - Export/Import session context for handover
 *
 * When current session context is exhausted, we can:
 * 1. Export session summary to a markdown file
 * 2. Create new session with the summary injected
 * 3. Continue supervising the new session
 */
import { ProjectStore } from './project-store.js';
import { TaskStore } from './task-store.js';
import { CheckpointStore } from './checkpoint-store.js';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { logger } from '../utils/logger.js';
export class SessionLog {
    projectStore = new ProjectStore();
    taskStore = new TaskStore();
    checkpointStore = new CheckpointStore();
    async exportSession(projectId, sessionId) {
        const project = await this.projectStore.loadProject(projectId);
        if (!project) {
            throw new Error(`Project ${projectId} not found`);
        }
        const tasks = await this.taskStore.listTasks(projectId);
        const checkpoints = await this.checkpointStore.listCheckpoints(projectId);
        const completedTasks = tasks
            .filter(task => task.status === 'completed')
            .map(task => ({
            id: task.id,
            subject: task.subject,
            description: task.description,
            completedAt: task.completedAt || task.updatedAt,
            keyOutputs: this.extractKeyOutputs(task, checkpoints),
        }));
        const currentTaskRecord = tasks.find(task => task.status === 'in_progress' || task.status === 'review_pending');
        const currentTask = currentTaskRecord
            ? {
                id: currentTaskRecord.id,
                subject: currentTaskRecord.subject,
                description: currentTaskRecord.description,
                status: currentTaskRecord.status,
                progressSummary: this.extractProgressSummary(currentTaskRecord, checkpoints),
                remainingWork: this.extractRemainingWork(currentTaskRecord),
            }
            : undefined;
        const pendingTasks = tasks
            .filter(task => task.status === 'pending' || task.status === 'assigned' || task.status === 'blocked' || task.status === 'review_failed')
            .map(task => ({
            id: task.id,
            subject: task.subject,
            description: task.description,
            priority: task.priority,
            blockedBy: task.blockedBy,
        }));
        const keyDecisions = this.extractKeyDecisions(checkpoints);
        const progress = tasks.length > 0 ? Math.round((completedTasks.length / tasks.length) * 100) : 0;
        return {
            projectId,
            projectName: project.name,
            projectDescription: project.description,
            workingDirectory: project.workingDirectory,
            exportedAt: new Date().toISOString(),
            fromSessionId: sessionId,
            completedTasks,
            currentTask,
            pendingTasks,
            keyDecisions,
            importantContext: this.extractImportantContext(tasks, checkpoints),
            codeChangesSummary: this.extractCodeChangesSummary(checkpoints),
            progress,
        };
    }
    async exportToMarkdown(projectId, sessionId) {
        const summary = await this.exportSession(projectId, sessionId);
        const markdown = this.formatAsMarkdown(summary);
        const project = await this.projectStore.loadProject(projectId);
        if (!project) {
            throw new Error(`Project ${projectId} not found`);
        }
        const sessionLogDir = join(project.workingDirectory, '.supervisor', 'sessions');
        await mkdir(sessionLogDir, { recursive: true });
        const filename = `session-${sessionId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.md`;
        const filepath = join(sessionLogDir, filename);
        await writeFile(filepath, markdown, 'utf-8');
        logger.info('SessionLog', 'Session exported to markdown', {
            projectId,
            filepath,
            progress: summary.progress,
        });
        return filepath;
    }
    formatAsMarkdown(summary) {
        const lines = [];
        lines.push('# 会话交接记录');
        lines.push('');
        lines.push(`> 导出时间: ${summary.exportedAt}`);
        lines.push(`> 原会话 ID: ${summary.fromSessionId}`);
        lines.push(`> 项目进度: ${summary.progress}%`);
        lines.push('');
        lines.push('## 项目信息');
        lines.push('');
        lines.push(`- **项目名称**: ${summary.projectName}`);
        lines.push(`- **项目描述**: ${summary.projectDescription}`);
        lines.push(`- **工作目录**: ${summary.workingDirectory}`);
        lines.push(`- **项目 ID**: ${summary.projectId}`);
        lines.push('');
        lines.push('## 已完成的工作');
        lines.push('');
        if (summary.completedTasks.length === 0) {
            lines.push('暂无已完成的任务。');
            lines.push('');
        }
        else {
            for (const task of summary.completedTasks) {
                lines.push(`### ${task.subject}`);
                lines.push('');
                lines.push(`- 任务 ID: ${task.id}`);
                lines.push(`- 完成时间: ${task.completedAt}`);
                lines.push(`- 描述: ${task.description}`);
                if (task.keyOutputs.length > 0) {
                    lines.push('- 关键产出:');
                    for (const output of task.keyOutputs) {
                        lines.push(`  - ${output}`);
                    }
                }
                lines.push('');
            }
        }
        if (summary.currentTask) {
            lines.push('## 当前任务');
            lines.push('');
            lines.push(`### ${summary.currentTask.subject}`);
            lines.push('');
            lines.push(`- 任务 ID: ${summary.currentTask.id}`);
            lines.push(`- 状态: ${summary.currentTask.status}`);
            lines.push(`- 描述: ${summary.currentTask.description}`);
            lines.push('');
            lines.push('**已完成部分:**');
            lines.push(summary.currentTask.progressSummary);
            lines.push('');
            lines.push('**待完成部分:**');
            lines.push(summary.currentTask.remainingWork);
            lines.push('');
        }
        lines.push('## 待执行的任务');
        lines.push('');
        if (summary.pendingTasks.length === 0) {
            lines.push('所有任务已完成。');
            lines.push('');
        }
        else {
            const sorted = [...summary.pendingTasks].sort((a, b) => a.priority - b.priority);
            for (const task of sorted) {
                const blockedBy = task.blockedBy.length > 0 ? ` (被阻塞: ${task.blockedBy.join(', ')})` : '';
                lines.push(`- [P${task.priority}] **${task.subject}**${blockedBy}`);
                lines.push(`  - 任务 ID: ${task.id}`);
                lines.push(`  - ${task.description}`);
                lines.push('');
            }
        }
        if (summary.keyDecisions.length > 0) {
            lines.push('## 关键决策');
            lines.push('');
            for (const decision of summary.keyDecisions) {
                lines.push(`- ${decision}`);
            }
            lines.push('');
        }
        if (summary.importantContext.length > 0) {
            lines.push('## 重要上下文');
            lines.push('');
            for (const context of summary.importantContext) {
                lines.push(`- ${context}`);
            }
            lines.push('');
        }
        if (summary.codeChangesSummary) {
            lines.push('## 代码变更摘要');
            lines.push('');
            lines.push(summary.codeChangesSummary);
            lines.push('');
        }
        lines.push('## 下一步建议');
        lines.push('');
        if (summary.currentTask) {
            lines.push(`1. 继续完成当前任务 "${summary.currentTask.subject}"`);
            lines.push('2. 完成后继续执行剩余待办任务');
        }
        else if (summary.pendingTasks.length > 0) {
            const nextTask = [...summary.pendingTasks].sort((a, b) => a.priority - b.priority)[0];
            if (nextTask) {
                lines.push(`1. 开始执行任务 "${nextTask.subject}" (Priority ${nextTask.priority})`);
                lines.push('2. 按优先级顺序继续执行其余任务');
            }
        }
        else {
            lines.push('1. 所有任务已完成，可以执行最终验收');
            lines.push('2. 使用 project_check_completion / project_confirm_supervisor / project_finalize 完成交付');
        }
        lines.push('');
        lines.push('---');
        lines.push('');
        lines.push('*此文件由 Codex Supervisor 自动生成，用于会话交接。*');
        return lines.join('\n');
    }
    extractKeyOutputs(task, checkpoints) {
        const outputs = [];
        const taskCheckpoints = checkpoints.filter(checkpoint => checkpoint.taskId === task.id && checkpoint.status === 'approved');
        for (const checkpoint of taskCheckpoints) {
            if (checkpoint.summary) {
                outputs.push(checkpoint.summary);
            }
        }
        for (const artifact of task.artifacts) {
            outputs.push(`${artifact.type}: ${artifact.path}${artifact.description ? ` (${artifact.description})` : ''}`);
        }
        return outputs;
    }
    extractProgressSummary(task, checkpoints) {
        const summaries = [];
        const taskCheckpoints = checkpoints.filter(checkpoint => checkpoint.taskId === task.id);
        for (const checkpoint of taskCheckpoints.filter(checkpoint => checkpoint.status === 'approved' || checkpoint.status === 'submitted')) {
            if (checkpoint.summary) {
                summaries.push(checkpoint.summary);
            }
        }
        if (summaries.length === 0) {
            return '任务已开始，但还没有可提取的阶段性总结。';
        }
        return summaries.join('\n');
    }
    extractRemainingWork(task) {
        if (typeof task.metadata['remainingWork'] === 'string' && task.metadata['remainingWork']) {
            return task.metadata['remainingWork'];
        }
        if (task.status === 'review_pending') {
            return '等待审核当前任务的检查点，审核通过后继续下一个任务。';
        }
        if (task.status === 'blocked') {
            return '该任务当前处于阻塞状态，需要先解决依赖或阻塞项。';
        }
        return '请根据任务描述、已完成部分和最新代码状态继续完成剩余工作。';
    }
    extractKeyDecisions(checkpoints) {
        const decisions = [];
        for (const checkpoint of checkpoints) {
            if (!checkpoint.feedback) {
                continue;
            }
            if (checkpoint.feedback.includes('决定') || checkpoint.feedback.includes('采用') || checkpoint.feedback.includes('选择')) {
                decisions.push(checkpoint.feedback);
            }
        }
        return decisions;
    }
    extractImportantContext(tasks, checkpoints) {
        const context = new Set();
        for (const task of tasks) {
            if (task.status === 'blocked' && task.blockedBy.length > 0) {
                context.add(`任务 ${task.subject} 仍被以下任务阻塞: ${task.blockedBy.join(', ')}`);
            }
            if (task.assignedWorker) {
                context.add(`任务 ${task.subject} 当前关联 Worker: ${task.assignedWorker}`);
            }
        }
        for (const checkpoint of checkpoints) {
            if (checkpoint.status === 'rejected' && checkpoint.feedback) {
                context.add(`检查点 ${checkpoint.id} 曾被拒绝，反馈: ${checkpoint.feedback}`);
            }
        }
        return Array.from(context);
    }
    extractCodeChangesSummary(checkpoints) {
        const changes = [];
        for (const checkpoint of checkpoints) {
            if (!checkpoint.codeChanges) {
                continue;
            }
            for (const change of checkpoint.codeChanges) {
                changes.push(`- ${change.type}: ${change.file}`);
            }
        }
        if (changes.length === 0) {
            return '';
        }
        return `本次会话累计变更 ${changes.length} 个文件:\n${changes.join('\n')}`;
    }
    async generateHandoverPrompt(projectId, sessionId) {
        const summary = await this.exportSession(projectId, sessionId);
        const markdown = this.formatAsMarkdown(summary);
        return [
            '你是一个新的 Codex 会话，正在接管之前会话的工作。',
            '',
            '以下是之前会话的工作记录，请完整阅读后继续执行未完成任务：',
            '',
            '---',
            '',
            markdown,
            '',
            '---',
            '',
            '重要要求：',
            `1. 项目 ID 是 ${summary.projectId}，后续 MCP 工具调用都使用这个项目 ID。`,
            '2. 先调用 session_list_all 或 session_get_stats 了解当前活跃会话。',
            '3. 再调用 supervisor_get_guidance 获取当前应该继续的任务。',
            '4. 如果要继续绑定当前新会话，调用 worker_spawn_virtual 绑定这个新会话。',
            '5. 工作过程中持续使用 task_report_progress 汇报状态。',
            '',
            '现在开始接管工作。',
        ].join('\n');
    }
}
//# sourceMappingURL=session-log.js.map