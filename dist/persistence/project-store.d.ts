/**
 * Project persistence store
 */
import type { Project, SupervisorStateSnapshot } from './types.js';
export declare class ProjectStore {
    /**
     * Create a new project
     */
    createProject(name: string, description: string, workingDirectory: string): Promise<Project>;
    /**
     * Save project metadata
     */
    saveProject(project: Project): Promise<void>;
    /**
     * Load project by ID
     */
    loadProject(projectId: string): Promise<Project | null>;
    /**
     * List all projects
     */
    listProjects(): Promise<Project[]>;
    /**
     * Save supervisor state snapshot
     */
    saveState(projectId: string, state: SupervisorStateSnapshot): Promise<void>;
    /**
     * Load supervisor state snapshot
     */
    loadState(projectId: string): Promise<SupervisorStateSnapshot | null>;
    /**
     * Update project status
     */
    updateStatus(projectId: string, status: Project['status']): Promise<Project | null>;
    /**
     * Mark supervisor confirmation
     */
    confirmSupervisor(projectId: string): Promise<Project | null>;
    /**
     * Archive project
     */
    archiveProject(projectId: string): Promise<void>;
    /**
     * Create initial state snapshot
     */
    private createInitialState;
}
//# sourceMappingURL=project-store.d.ts.map