import { StateMachine } from '../dist/core/state-machine.js';

describe('StateMachine', () => {
  it('starts idle and exposes valid initial transitions', () => {
    const machine = new StateMachine('project-1');

    expect(machine.getState()).toBe('IDLE');
    expect(machine.getValidEvents()).toEqual(['start_project']);
    expect(machine.getStateDescription()).toContain('No active project');
  });

  it('records valid state transitions', () => {
    const machine = new StateMachine('project-1');

    const result = machine.transition('start_project');

    expect(result).toEqual({ success: true, newState: 'INITIALIZING' });
    expect(machine.getState()).toBe('INITIALIZING');
    expect(machine.getHistory()).toHaveLength(1);
    expect(machine.getHistory()[0]).toMatchObject({
      state: 'INITIALIZING',
      event: 'start_project',
    });
  });

  it('rejects invalid transitions without changing state', () => {
    const machine = new StateMachine('project-1');

    const result = machine.transition('review_done');

    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid transition 'review_done'");
    expect(machine.getState()).toBe('IDLE');
  });
});
