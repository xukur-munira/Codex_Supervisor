/**
 * Project persistence store
 */
import { ensureDir, readJsonFile, writeJsonFile } from '../utils/common.js';
import { getProjectDir, getProjectFile, getStateFile, getTasksDir, getCheckpointsDir, getProjectsDir, } from '../utils/paths.js';
import { generateId } from '../utils/common.js';
import { logger } from '../utils/logger.js';
export class ProjectStore {
    /**
     * Create a new project
     */
    async createProject(name, description, workingDirectory) {
        const projectId = generateId();
        const projectDir = getProjectDir(projectId);
        await ensureDir(projectDir);
        await ensureDir(getTasksDir(projectId));
        await ensureDir(getCheckpointsDir(projectId));
        await ensureDir(`${projectDir}/messages`);
        const now = new Date().toISOString();
        const project = {
            id: projectId,
            name,
            description,
            status: 'INITIALIZING',
            createdAt: now,
            updatedAt: now,
            supervisorConfirmed: false,
            workingDirectory,
            metadata: {},
        };
        await this.saveProject(project);
        await this.saveState(projectId, this.createInitialState(projectId));
        logger.info('ProjectStore', 'Project created', { projectId, name });
        return project;
    }
    /**
     * Save project metadata
     */
    async saveProject(project) {
        project.updatedAt = new Date().toISOString();
        await writeJsonFile(getProjectFile(project.id), project);
    }
    /**
     * Load project by ID
     */
    async loadProject(projectId) {
        return readJsonFile(getProjectFile(projectId));
    }
    /**
     * List all projects
     */
    async listProjects() {
        const fs = await import('fs/promises');
        const projectsDir = getProjectsDir();
        await ensureDir(projectsDir);
        try {
            const entries = await fs.readdir(projectsDir, { withFileTypes: true });
            const projects = [];
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const project = await this.loadProject(entry.name);
                    if (project) {
                        projects.push(project);
                    }
                }
            }
            return projects;
        }
        catch {
            return [];
        }
    }
    /**
     * Save supervisor state snapshot
     */
    async saveState(projectId, state) {
        state.updatedAt = new Date().toISOString();
        await writeJsonFile(getStateFile(projectId), state);
    }
    /**
     * Load supervisor state snapshot
     */
    async loadState(projectId) {
        return readJsonFile(getStateFile(projectId));
    }
    /**
     * Update project status
     */
    async updateStatus(projectId, status) {
        const project = await this.loadProject(projectId);
        if (!project) {
            return null;
        }
        project.status = status;
        await this.saveProject(project);
        // Also update state snapshot
        const state = await this.loadState(projectId);
        if (state) {
            state.state = status;
            await this.saveState(projectId, state);
        }
        return project;
    }
    /**
     * Mark supervisor confirmation
     */
    async confirmSupervisor(projectId) {
        const project = await this.loadProject(projectId);
        if (!project) {
            return null;
        }
        project.supervisorConfirmed = true;
        await this.saveProject(project);
        return project;
    }
    /**
     * Archive project
     */
    async archiveProject(projectId) {
        const project = await this.loadProject(projectId);
        if (project) {
            project.status = 'ARCHIVED';
            await this.saveProject(project);
        }
    }
    /**
     * Create initial state snapshot
     */
    createInitialState(projectId) {
        return {
            projectId,
            state: 'INITIALIZING',
            updatedAt: new Date().toISOString(),
            activeWorkers: [],
            pendingTasks: [],
            blockedTasks: [],
            completedTasks: [],
        };
    }
}
//# sourceMappingURL=project-store.js.map