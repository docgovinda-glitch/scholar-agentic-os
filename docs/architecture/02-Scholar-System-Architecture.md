# Scholar System Architecture

## Platform Layers

### Foundation Layer
- Core types and interfaces
- Dependency injection system
- Event bus
- Storage abstractions

### AI Operating System Layer
- **AIKernel** - Central orchestrator for all AI operations
- Provider adapters (OpenAI, Anthropic, Google, Ollama, LM Studio)
- Routing and policy engine
- Fallback and retry mechanisms

### Research Operating System Layer
- **ResearchIntelligenceEngine** - Research reasoning engine
- Literature discovery providers
- Evidence review workspace
- Novelty analysis, framework generation, methodology recommendation

### Knowledge Operating System Layer (T018)
- Knowledge graph
- Semantic memory
- Knowledge object management

### Writing Operating System Layer (T019)
- Manuscript drafting
- Citation generation
- Language refinement

### Document Intelligence Layer (`src/document_intelligence/`)
- Parser suite: PDF, DOCX, TXT, Markdown → Canonical Document Model (CDM)
- Pipeline with pluggable stages (format identification, validation, etc.) via `stageRegistry`
- Feeds structured document content into the evidence/knowledge pipeline

### Citation & Academic Compliance Layer (`src/citation_compliance/`)
- `CitationRegistry` + `formattingEngine` — pluggable reference formatting
- Formatters: APA7, IEEE, MLA9, Chicago, Harvard, Vancouver

### Multi-Agent Orchestration Layer (`src/orchestrator/` + `src/agents/`)
- `MultiAgentOrchestrator` / `WorkflowEngine` coordinate execution of scholarly agents (research planner, literature review, methodology advisor, statistical analysis, integrity reviewer, manuscript writer, etc.)
- Supporting services: execution queue/scheduler, dependency resolution, approval gates, retry/failure recovery, checkpointing, audit/history, health/metrics

### Knowledge Vault (`src/knowledge_vault/`)
- `KnowledgeVaultService` — document repository/indexing service, distinct from the structured Knowledge OS (`src/knowledge/`); holds raw literature/document indexes rather than reasoned Knowledge Objects

### Backend Service Layer (`server/`)
- Express routes: `ai.ts`, `auth.ts`, `parser.ts`
- Services: `aiService.ts`, `userDb.ts`
- Middleware: `authRateLimiter.ts`
- Data layer: `db.ts`, `vectorStore.ts`, `objectStorage.ts`, `searchIndex.ts`, `userStore.ts`, migrations
- Entry point: `server.ts` (run via `tsx` in dev, bundled with esbuild for production)

## Kernel Architecture

Each kernel implements a standard lifecycle:
```typescript
interface Kernel {
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  health(): Promise<HealthStatus>;
  configuration(): KernelConfig;
  capabilities(): KernelCapabilities;
  execute<T>(input: T): Promise<T>;
  events(): EventBus;
  metrics(): Metrics;
}
```

## Module Boundaries

> **Note**: Unlike the AI/Knowledge/Writing/Publication/Workspace/Collaboration layers, the Research layer is implemented as `ResearchIntelligenceEngine` + `ResearchDiscoveryEngine` — it does **not** currently have a `ResearchKernel` class. This is a known documentation/implementation inconsistency; the "Research Kernel" name below refers to this engine pairing, not a literal `Kernel`-implementing class.

### AI Kernel Dependencies
- Cannot import from Research
- Cannot import from Knowledge
- Can import shared types and utils

### Research Kernel Dependencies
- Imports from AI Kernel (for AI assistance)
- Cannot import from Knowledge
- Cannot import from UI

### Knowledge Kernel Dependencies
- Imports from AI Kernel (for embeddings)
- Imports from Research Kernel (for evidence)
- Cannot import UI components

## Public APIs

All cross-kernel communication through defined interfaces:
- `AIKernel.generate()` - AI text generation
- `ResearchIntelligenceEngine.analyze()` - Research reasoning
- `EvidenceReviewWorkspace.getApprovedEvidence()` - Evidence retrieval

## Event System

Global events through EventBus:
- `research.topic.submitted`
- `evidence.approved`
- `knowledge.created`
- `manuscript.drafted`

## Plugin Architecture

Plugins extend functionality without modifying core:
- Provider plugins
- Format plugins
- Analysis plugins
- Export plugins

## Security

- Encrypted API key storage
- Rate limiting on all endpoints
- Privacy level enforcement in AI routing
- User authentication and authorization

## Observability

- TelemetryCollector for all operations
- Provider health monitoring
- Cache hit/miss metrics
- Execution timing and costs

## Storage

- Vector store for embeddings
- Object storage for documents
- Search index for discovery
- SQLite for user data