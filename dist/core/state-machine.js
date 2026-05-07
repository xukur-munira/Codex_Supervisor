/**
 * Supervisor state machine
 */
import { logger } from '../utils/logger.js';
const TRANSITIONS = [
    { from: 'IDLE', to: 'INITIALIZING', event: 'start_project' },
    { from: 'INITIALIZING', to: 'PLANNING', event: 'tasks_decomposed' },
    { from: 'PLANNING', to: 'SUPERVISING', event: 'workers_spawned' },
    { from: 'SUPERVISING', to: 'BLOCKED', event: 'task_blocked' },
    { from: 'SUPERVISING', to: 'REVIEWING', event: 'checkpoint_ready' },
    { from: 'SUPERVISING', to: 'COMPLETING', event: 'all_tasks_done' },
    { from: 'BLOCKED', to: 'SUPERVISING', event: 'blocker_resolved' },
    { from: 'REVIEWING', to: 'SUPERVISING', event: 'review_done' },
    { from: 'REVIEWING', to: 'COMPLETING', event: 'review_approved' },
    { from: 'COMPLETING', to: 'SUPERVISING', event: 'review_failed' },
    { from: 'COMPLETING', to: 'COMPLETED', event: 'all_criteria_met' },
    { from: 'COMPLETED', to: 'ARCHIVED', event: 'finalize' },
];
export class StateMachine {
    currentState = 'IDLE';
    projectId;
    stateHistory = [];
    constructor(projectId) {
        this.projectId = projectId;
    }
    /**
     * Get current state
     */
    getState() {
        return this.currentState;
    }
    /**
     * Check if a transition is valid
     */
    canTransition(event) {
        return TRANSITIONS.some(t => t.from === this.currentState && t.event === event);
    }
    /**
     * Get valid transitions from current state
     */
    getValidTransitions() {
        return TRANSITIONS
            .filter(t => t.from === this.currentState)
            .map(t => ({ event: t.event, to: t.to }));
    }
    /**
     * Get valid events from current state
     */
    getValidEvents() {
        return this.getValidTransitions().map(t => t.event);
    }
    /**
     * Attempt a state transition
     */
    transition(event) {
        const transition = TRANSITIONS.find(t => t.from === this.currentState && t.event === event);
        if (!transition) {
            const validEvents = this.getValidEvents().join(', ');
            logger.warn('StateMachine', 'Invalid transition', {
                projectId: this.projectId,
                currentState: this.currentState,
                event,
                validEvents,
            });
            return {
                success: false,
                error: `Invalid transition '${event}' from state '${this.currentState}'. Valid events: ${validEvents || 'none'}`,
            };
        }
        const previousState = this.currentState;
        this.currentState = transition.to;
        this.stateHistory.push({
            state: transition.to,
            timestamp: new Date().toISOString(),
            event,
        });
        logger.info('StateMachine', 'State transition', {
            projectId: this.projectId,
            from: previousState,
            to: transition.to,
            event,
        });
        return { success: true, newState: transition.to };
    }
    /**
     * Force set state (for recovery scenarios)
     */
    forceState(state) {
        logger.warn('StateMachine', 'Force setting state', {
            projectId: this.projectId,
            from: this.currentState,
            to: state,
        });
        this.currentState = state;
        this.stateHistory.push({
            state,
            timestamp: new Date().toISOString(),
            event: 'force_set',
        });
    }
    /**
     * Get state history
     */
    getHistory() {
        return [...this.stateHistory];
    }
    /**
     * Get state description
     */
    getStateDescription() {
        const descriptions = {
            IDLE: 'No active project',
            INITIALIZING: 'Creating project and setting up environment',
            PLANNING: 'Decomposing project into tasks',
            SUPERVISING: 'Monitoring worker sessions and progress',
            BLOCKED: 'Waiting for blockers to be resolved',
            REVIEWING: 'Reviewing checkpoint submissions',
            COMPLETING: 'Verifying completion criteria',
            COMPLETED: 'All criteria met, project complete',
            ARCHIVED: 'Project archived',
        };
        return descriptions[this.currentState] || 'Unknown state';
    }
    /**
     * Reset to initial state
     */
    reset() {
        this.currentState = 'IDLE';
        this.stateHistory = [];
        logger.info('StateMachine', 'State machine reset', { projectId: this.projectId });
    }
    /**
     * Serialize state machine for persistence
     */
    serialize() {
        return {
            currentState: this.currentState,
            history: this.stateHistory,
        };
    }
    /**
     * Restore state machine from persisted data
     */
    deserialize(data) {
        this.currentState = data.currentState;
        if (data.history) {
            this.stateHistory = data.history;
        }
    }
}
//# sourceMappingURL=state-machine.js.map