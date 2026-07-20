/**
 * Research Lifecycle Engine - Orchestrates research from idea to publication
 */

export type ResearchStage = 
  | 'idea'
  | 'validation'
  | 'novelty'
  | 'literature'
  | 'evidence'
  | 'organization'
  | 'gaps'
  | 'questions'
  | 'hypotheses'
  | 'methodology'
  | 'data'
  | 'analysis'
  | 'writing'
  | 'citations'
  | 'journal'
  | 'submission'
  | 'publication';

const STAGE_ORDER: ResearchStage[] = [
  'idea', 'validation', 'novelty', 'literature', 'evidence',
  'organization', 'gaps', 'questions', 'hypotheses',
  'methodology', 'data', 'analysis', 'writing', 'citations',
  'journal', 'submission', 'publication'
];

export interface LifecycleStage {
  stage: ResearchStage;
  status: 'pending' | 'in-progress' | 'complete' | 'blocked';
  progress: number;
  inputs: string[];
  outputs: string[];
  dependencies: ResearchStage[];
}

export interface LifecycleProject {
  id: string;
  title: string;
  stage: ResearchStage;
  stages: Map<ResearchStage, LifecycleStage>;
  createdAt: string;
  updatedAt: string;
}

export class ResearchLifecycleEngine {
  private static instance: ResearchLifecycleEngine;
  private projects: Map<string, LifecycleProject> = new Map();

  private constructor() {}

  static getInstance(): ResearchLifecycleEngine {
    if (!ResearchLifecycleEngine.instance) {
      ResearchLifecycleEngine.instance = new ResearchLifecycleEngine();
    }
    return ResearchLifecycleEngine.instance;
  }

  createProject(title: string): LifecycleProject {
    const project: LifecycleProject = {
      id: crypto.randomUUID(),
      title,
      stage: 'idea',
      stages: this._initializeStages(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.projects.set(project.id, project);
    return project;
  }

  getProject(id: string): LifecycleProject | undefined {
    return this.projects.get(id);
  }

  advanceStage(id: string, stage: ResearchStage): boolean {
    const project = this.projects.get(id);
    if (!project) return false;
    project.stage = stage;
    project.updatedAt = new Date().toISOString();
    return true;
  }

  calculateReadiness(project: LifecycleProject): number {
    const completed = Array.from(project.stages.values()).filter(s => s.status === 'complete').length;
    return Math.round((completed / 17) * 100);
  }

  private _initializeStages(): Map<ResearchStage, LifecycleStage> {
    const stages = new Map<ResearchStage, LifecycleStage>();
    STAGE_ORDER.forEach((stage: ResearchStage) => {
      stages.set(stage, {
        stage,
        status: 'pending',
        progress: 0,
        inputs: [],
        outputs: [],
        dependencies: this._getDependencies(stage)
      });
    });
    return stages;
  }

  private _getDependencies(stage: ResearchStage): ResearchStage[] {
    const idx = STAGE_ORDER.indexOf(stage);
    if (idx <= 0) return [];
    return [STAGE_ORDER[idx - 1]];
  }
}