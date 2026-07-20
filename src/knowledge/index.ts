/**
 * Knowledge Operating System
 */

// Types
export * from './types';

// Core Kernel
export { KnowledgeKernel } from './KnowledgeKernel';

// Registry
export { KnowledgeRegistry } from './registry/KnowledgeRegistry';

// Storage
export * from './storage/types';

// Graph
export { KnowledgeGraph } from './graph/KnowledgeGraph';

// Memory
export { SemanticMemory } from './memory/SemanticMemory';

// Relationships
export { RelationshipEngine } from './relationships/RelationshipEngine';

// Query
export { KnowledgeQueryEngine } from './query/KQL';
export type { KnowledgeQuery, QueryType } from './query/KQL';

// Reasoning
export { ReasoningEngine } from './reasoning/ReasoningEngine';
export type { ReasoningType, ReasoningInput, ReasoningResult } from './reasoning/ReasoningEngine';

// Intelligence
export { KnowledgeIntelligenceEngine } from './intelligence/KnowledgeIntelligenceEngine';
export type {
  IntelligenceQuery,
  IntelligenceResult,
  SynthesisResult,
  GapResult,
  HypothesisResult
} from './intelligence/KnowledgeIntelligenceEngine';