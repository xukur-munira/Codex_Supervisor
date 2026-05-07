/**
 * Supervisor state machine
 */
import type { SupervisorState } from '../persistence/types.js';
export declare class StateMachine {
    private currentState;
    private projectId;
    private stateHistory;
    constructor(projectId: string);
    /**
     * Get current state
     */
    getState(): SupervisorState;
    /**
     * Check if a transition is valid
     */
    canTransition(event: string): boolean;
    /**
     * Get valid transitions from current state
     */
    getValidTransitions(): Array<{
        event: string;
        to: SupervisorState;
    }>;
    /**
     * Get valid events from current state
     */
    getValidEvents(): string[];
    /**
     * Attempt a state transition
     */
    transition(event: string): {
        success: boolean;
        newState?: SupervisorState;
        error?: string;
    };
    /**
     * Force set state (for recovery scenarios)
     */
    forceState(state: SupervisorState): void;
    /**
     * Get state history
     */
    getHistory(): typeof this.stateHistory;
    /**
     * Get state description
     */
    getStateDescription(): string;
    /**
     * Reset to initial state
     */
    reset(): void;
    /**
     * Serialize state machine for persistence
     */
    serialize(): {
        currentState: SupervisorState;
        history: Array<{
            state: SupervisorState;
            timestamp: string;
            event: string;
        }>;
    };
    /**
     * Restore state machine from persisted data
     */
    deserialize(data: {
        currentState: SupervisorState;
        history?: Array<{
            state: SupervisorState;
            timestamp: string;
            event: string;
        }>;
    }): void;
}
//# sourceMappingURL=state-machine.d.ts.map