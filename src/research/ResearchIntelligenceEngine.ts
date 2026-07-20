/**
 * Research Intelligence Engine
 * 
 * Core engine for research intelligence, integrating with AIKernel.
 */

import type { ResearchProject, ResearchSession, ResearchIntent, ResearchContext, ResearchTask, ResearchOntology, ResearchMemory, ResearchFinding } from './types';
import { AIKernel } from '../ai/core/AIKernel';
import type { AIRequest } from '../ai/types';

export class ResearchIntelligenceEngine {
  private static instance: ResearchIntelligenceEngine;
  private kernel: AIKernel;
  private projects: Map<string, ResearchProject> = new Map();
  private sessions: Map<string, ResearchSession> = new Map();
  private memory: Map<string, ResearchMemory[]> = new Map();

  private constructor() {
    this.kernel = AIKernel.getInstance();
  }

  static getInstance(): ResearchIntelligenceEngine {
    if (!ResearchIntelligenceEngine.instance) {
      ResearchIntelligenceEngine.instance = new ResearchIntelligenceEngine();
    }
    return ResearchIntelligenceEngine.instance;
  }

  /**
   * Create a new research project
   */
  createProject(title: string, description: string, domain: string): ResearchProject {
    const project: ResearchProject = {
      id: crypto.randomUUID(),
      title,
      description,
      domain: domain as any,
      stage: 'intake',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      context: this._createInitialContext(domain),
      tasks: []
    };

    this.projects.set(project.id, project);
    return project;
  }

  private _createInitialContext(domain: string): ResearchContext {
    return {
      domain: domain as any,
      objective: '',
      questions: [],
      constraints: [],
      preferences: {
        prioritizeLocalAI: true
      }
    };
  }

  /**
   * Get a project by ID
   */
  getProject(id: string): ResearchProject | undefined {
    return this.projects.get(id);
  }

  /**
   * Get all projects
   */
  getAllProjects(): ResearchProject[] {
    return Array.from(this.projects.values());
  }

  /**
   * Create a research session
   */
  createSession(projectId: string): ResearchSession {
    const project = this.projects.get(projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    const session: ResearchSession = {
      id: crypto.randomUUID(),
      projectId,
      startedAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      context: project.context,
      findings: []
    };

    this.sessions.set(session.id, session);
    return session;
  }

  /**
   * Analyze and route a research task through AIKernel
   */
  async executeTask(projectId: string, task: ResearchTask): Promise<unknown> {
    const project = this.projects.get(projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    task.status = 'running';
    task.startedAt = new Date().toISOString();

    try {
      // Use AIKernel for execution
      const request: AIRequest = {
        systemInstruction: 'You are a research assistant.',
        prompt: task.description,
        temperature: 0.7,
        taskType: this._mapIntentToTaskType(task.type) as any
      };

      const response = await this.kernel.generate(request);

      task.status = 'completed';
      task.result = response;
      task.completedAt = new Date().toISOString();

      project.updatedAt = new Date().toISOString();

      return response;
    } catch (error) {
      task.status = 'failed';
      throw error;
    }
  }

  private _mapIntentToTaskType(intent: ResearchIntent): string {
    const mapping: Record<ResearchIntent, string> = {
      'literature-review': 'literature-review',
      'hypothesis-generation': 'grounding',
      'methodology-design': 'methodology',
      'data-analysis': 'data-discovery',
      'manuscript-writing': 'drafting',
      'novelty-assessment': 'general',
      'framework-analysis': 'grounding',
      'gap-detection': 'general'
    };
    return mapping[intent] || 'general';
  }

  /**
   * Store a memory entry
   */
  storeMemory(projectId: string, entry: ResearchMemory): void {
    const existing = this.memory.get(projectId) || [];
    existing.push(entry);
    this.memory.set(projectId, existing);
  }

  /**
   * Get memory entries for a project
   */
  getMemory(projectId: string): ResearchMemory[] {
    return this.memory.get(projectId) || [];
  }

  /**
   * Build ontology from findings
   */
  buildOntology(projectId: string, findings: ResearchFinding[]): ResearchOntology {
    const ontology: ResearchOntology = {
      concepts: [],
      variables: [],
      theories: [],
      methods: [],
      relationships: []
    };

    for (const finding of findings) {
      if (finding.type === 'concept') {
        ontology.concepts.push(finding.content);
      }
      if (finding.type === 'variable') {
        ontology.variables.push(finding.content);
      }
    }

    return ontology;
  }
}