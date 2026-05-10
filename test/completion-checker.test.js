import { CompletionChecker } from '../dist/core/completion-checker.js';

describe('CompletionChecker', () => {
  const checker = new CompletionChecker();

  it('requires at least one completed task before a project can be complete', () => {
    expect(checker.checkAllTasksComplete([])).toBe(false);
    expect(checker.getProgress([])).toBe(0);
  });

  it('calculates task completion and blocker state from task status', () => {
    const tasks = [
      { id: 'task-1', status: 'completed' },
      { id: 'task-2', status: 'completed' },
    ];

    expect(checker.checkAllTasksComplete(tasks)).toBe(true);
    expect(checker.checkNoBlockers(tasks)).toBe(true);
    expect(checker.getProgress(tasks)).toBe(100);
  });

  it('detects incomplete and blocked task states', () => {
    const tasks = [
      { id: 'task-1', status: 'completed' },
      { id: 'task-2', status: 'blocked' },
    ];

    expect(checker.checkAllTasksComplete(tasks)).toBe(false);
    expect(checker.checkNoBlockers(tasks)).toBe(false);
    expect(checker.getProgress(tasks)).toBe(50);
  });

  it('uses the latest post-task checkpoint to evaluate test results', () => {
    const checkpoints = [
      {
        type: 'post_task',
        createdAt: '2026-05-01T00:00:00.000Z',
        testResults: [{ failed: 2 }],
      },
      {
        type: 'post_task',
        createdAt: '2026-05-02T00:00:00.000Z',
        testResults: [{ failed: 0 }],
      },
    ];

    expect(checker.checkAllTestsPassing(checkpoints)).toBe(true);
  });
});
