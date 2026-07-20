/**
 * Research Intelligence Types
 * 
 * Core type definitions for the research intelligence engine.
 */

// Research Domain
export type ResearchDomain = 
  | 'computer-science'
  | 'engineering'
  | 'mathematics'
  | 'physics'
  | 'chemistry'
  | 'biology'
  | 'medicine'
  | 'psychology'
  | 'sociology'
  | 'economics'
  | 'business'
  | 'education'
  | 'literature'
  | 'history'
  | 'philosophy'
  | 'law'
  | 'political-science'
  | 'environmental-science'
  | 'other';

// Research Subdiscipline
export type ResearchSubdiscipline = string;

// Research Intent
export type ResearchIntent = 
  | 'literature-review'
  | 'hypothesis-generation'
  | 'methodology-design'
  | 'data-analysis'
  | 'manuscript-writing'
  | 'novelty-assessment'
  | 'framework-analysis'
  | 'gap-detection';

// Research Entity Types
export type EntityType = 
  | 'concept'
  | 'variable'
  | 'theory'
  | 'method'
  | 'dataset'
  | 'author'
  | 'institution'
  | 'publication'
  | 'construct';

// Research Session
export interface ResearchSession {
  id: string;
  projectId: string;
  startedAt: string;
  lastActivity: string;
  context: ResearchContext;
  findings: ResearchFinding[];
}

// Research Context
export interface ResearchContext {
  domain: ResearchDomain;
  subdiscipline?: ResearchSubdiscipline;
  objective: string;
  questions: ResearchQuestion[];
  constraints: ResearchConstraint[];
  preferences: ResearchPreferences;
}

// Research Constraint
export interface ResearchConstraint {
  type: 'privacy' | 'budget' | 'timeline' | 'data-access' | 'methodology';
  value: string;
}

// Research Preferences
export interface ResearchPreferences {
  prioritizeLocalAI: boolean;
  maxCost?: number;
  preferredProviders?: string[];
}

// Research Question
export interface ResearchQuestion {
  id: string;
  text: string;
  type: 'primary' | 'secondary';
  status: 'pending' | 'analyzed' | 'answered';
}

// Research Finding
export interface ResearchFinding {
  id: string;
  type: EntityType;
  content: string;
  confidence: number;
  source?: string;
  timestamp: string;
}

// Research Task
export interface ResearchTask {
  id: string;
  type: ResearchIntent;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: unknown;
  startedAt?: string;
  completedAt?: string;
}

// Research Project
export interface ResearchProject {
  id: string;
  title: string;
  description: string;
  domain: ResearchDomain;
  stage: 'intake' | 'literature' | 'framework' | 'methodology' | 'analysis' | 'writing' | 'review';
  createdAt: string;
  updatedAt: string;
  context: ResearchContext;
  tasks: ResearchTask[];
}

// Research Memory
export interface ResearchMemory {
  key: string;
  value: unknown;
  type: 'fact' | 'inference' | 'observation';
  confidence: number;
  timestamp: string;
  source: string;
}

// Extracted Entities
export interface ExtractedEntity {
  type: EntityType;
  value: string;
  confidence: number;
  context?: string;
}

// Research Ontology
export interface ResearchOntology {
  concepts: string[];
  variables: string[];
  theories: string[];
  methods: string[];
  relationships: ResearchRelationship[];
}

// Research Relationship
export interface ResearchRelationship {
  source: string;
  target: string;
  type: 'causes' | 'correlates' | 'depends-on' | 'influences' | 'extends';
  strength: number;
}