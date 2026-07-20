/**
 * Research Intelligence Module
 */

// Types
export * from './types';
export * from './discovery/types';

// Core Engine
export { ResearchIntelligenceEngine } from './ResearchIntelligenceEngine';

// Analyzers
export * from './analyzers';

// Literature
export * from './literature';

// Novelty
export * from './novelty/NoveltyEngine';

// Framework
export * from './framework/FrameworkEngine';

// Methodology
export * from './methodology/MethodologyAdvisor';

// Roadmap
export * from './roadmap/RoadmapGenerator';

// Discovery
export { ProviderManager } from './discovery/ProviderManager';
export { SearchPlanner } from './discovery/SearchPlanner';
export { ResearchDiscoveryEngine } from './discovery/ResearchDiscoveryEngine';
export { BaseLiteratureProvider } from './discovery/LiteratureProvider';

// Providers
export { OpenAlexProvider } from './providers/OpenAlexProvider';
export { CrossrefProvider } from './providers/CrossrefProvider';
export { ProviderSelector } from './providers/ProviderSelector';

// Evidence
export { EvidenceReviewWorkspace } from './evidence/EvidenceReviewWorkspace';