# Core Framework Architecture Report

## Executive Summary

The Core Framework provides the foundational infrastructure for the Doctoral Research Assistant, including project lifecycle management, manuscript pipeline orchestration, and shared domain types. This analysis documents the complete architecture.

---

## 1. Complete Project Lifecycle

### Project Creation Flow

```
Project Creation
    ↓
ProjectBuilder.createProject(id, title)
    - Initializes identity, status, artifacts, knowledge, history, diagnostics, configuration
    ↓
Builder Pattern Chain
    - attachResearchPlan() → artifacts.researchPlanId
    - attachLiteratureReview() → artifacts.literatureReviewId
    - attachKnowledgeGap() → artifacts.knowledgeGapReportId
    - attachResearchQuestions() → artifacts.researchQuestionReportId
    - attachMethodology() → artifacts.methodologyReportId
    - attachStatistics() → artifacts.statisticalAnalysisReportId
    - attachIntegrityReview() → artifacts.integrityReviewReportId
    - attachDocuments(documentIds) → knowledge.documentIds
    - attachReferences(referenceIds) → knowledge.referenceIds
    - attachMetadata(metadata) → metadata
    - attachExecution(entry) → history.executions
    ↓
builder.build()
    - Validates required sections exist
    - Returns CanonicalResearchProject
```

### Project Lifecycle Flow

```
Project Lifecycle
    ↓
1. Creation (ProjectBuilder)
2. Validation (ProjectValidator)
    - Checks required sections
    - Checks duplicate IDs
    - Checks schema version compatibility
3. Persistence (ProjectSerializer)
    - toJSON() / fromJSON()
    - toCompressed() / fromCompressed() (placeholder database methods)
4. Versioning (ProjectVersionManager)
    - createSnapshot(project, state) → ProjectSnapshot
    - applyPatch(project, patch) → versioned project
    - rollback(projectId, toVersion) → previous version
5. Workflow Progression
    - ManuscriptPipeline builds sections from CRPM
    - buildSection(type, project) → ManuscriptSection
    - buildAll(project) → all sections in order
```

---

## 2. Domain Model Architecture

### Core Domain Types (`src/core/domain.ts`)

```typescript
export type EntityId = string;
export type ISODateString = string;

export interface AuditStamp {
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface UserIdentity extends AuditStamp { ... }
export interface ResearchWorkspace extends AuditStamp { ... }
export interface KnowledgeSource extends AuditStamp { ... }
export interface CitationRecord extends AuditStamp { ... }
```

**Purpose:** Base types for all domain entities with audit timestamps.

### Result Type (`src/core/result.ts`)

```typescript
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };
```

**Purpose:** Functional error handling without exceptions. Used by `storage.ts` for read/write operations.

### Storage Abstraction (`src/core/storage.ts`)

```typescript
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function readJson<T>(store, key): Result<T | null>;
export function writeJson<T>(store, key, value): Result<void>;
export function createBrowserStorage(): KeyValueStore;
```

**Purpose:** Abstracts browser localStorage with fallback to memory store. Provides typed JSON operations.

---

## 3. Canonical Research Project Model (CRPM)

### Project Types (`project/projectTypes.ts`)

| Type | Purpose |
|------|---------|
| `ProjectIdentity` | Project ID, title, description, discipline, keywords, timestamps |
| `ProjectMetadata` | Author info, collaborators, institution, target journal, deadline, funding |
| `ProjectStatus` | Phase (planning→literature→design→execution→analysis→writing→review→submission), progress, readiness |
| `AgentOutputs` | References to IDs of agent-generated artifacts |
| `KnowledgeAssets` | Lists of document and reference IDs |
| `ExecutionEntry` | Agent execution history (agentId, timestamp, duration, result) |
| `VersionEntry` | Version history (version, timestamp, changes, author) |
| `ProjectDiagnostics` | Validation errors/warnings, last validated timestamp |
| `ProjectConfiguration` | Schema version, preferences |

### Project Model (`project/projectModel.ts`)

```typescript
export interface CanonicalResearchProject {
  identity: ProjectIdentity;
  metadata: ProjectMetadata;
  status: ProjectStatus;
  artifacts: AgentOutputs;
  knowledge: KnowledgeAssets;
  history: {
    executions: ExecutionEntry[];
    versions: VersionEntry[];
  };
  diagnostics: ProjectDiagnostics;
  configuration: ProjectConfiguration;
}

export interface ProjectSnapshot {
  project: CanonicalResearchProject;
  state: ProjectState;
  frozenAt: string;
}

export type ProjectState = "draft" | "in-progress" | "review" | "complete" | "archived";
```

---

## 4. Module-by-Module Analysis

### 4.1 ProjectBuilder (`project/projectBuilder.ts`)

**Purpose:** Fluent builder for constructing CRPM instances.

**Workflow:**
1. `createProject(id, title)` creates initial partial project
2. `attachX()` methods progressively add components
3. `build()` validates and returns complete CRPM

**Key Methods:**
- `attachResearchPlan()`, `attachLiteratureReview()`, `attachKnowledgeGap()`, `attachResearchQuestions()`, `attachMethodology()`, `attachStatistics()`, `attachIntegrityReview()` - attach agent outputs
- `attachDocuments()`, `attachReferences()` - attach knowledge assets
- `attachMetadata()`, `attachExecution()` - attach metadata and history

### 4.2 ProjectValidator (`project/projectValidator.ts`)

**Purpose:** Validates CRPM integrity with pluggable rules.

**Built-in Rules:**
1. `duplicate-ids`: Checks document/reference IDs for duplicates
2. `required-sections`: Validates identity, metadata, status exist
3. `version-compatibility`: Ensures schemaVersion === "1.0.0"

**Public Interface:**
```typescript
interface ValidationRule {
  name: string;
  validate: (project: CanonicalResearchProject) => ValidationResult;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
```

### 4.3 ProjectSerializer (`project/projectSerializer.ts`)

**Purpose:** Serializes/deserializes CRPM to/from various formats.

**Formats:**
- `json`: Standard JSON serialization
- `compressed`: Base64-encoded JSON (toCompressed/fromCompressed)
- `database`: Placeholder methods (async, not implemented)

### 4.4 ProjectVersionManager (`project/projectVersionManager.ts`)

**Purpose:** Manages project versioning and snapshots.

**Features:**
- In-memory snapshot storage (Map-based)
- Snapshot creation with state freezing
- Migration hook (updates schemaVersion only)
- Patch operations (adds VersionEntry to history)
- Rollback to previous versions (queries snapshots)

**Known Issue:** The `rollback` method incorrectly compares `s.project.identity.id === toVersion` instead of comparing version history entries.

### 4.5 ManuscriptPipeline (`manuscript/pipeline/pipeline.ts`)

**Purpose:** Section-by-section manuscript generation pipeline.

**Workflow:**
1. Register builders/validators per section type
2. `buildSection(type, project)` executes builder then validator
3. `buildAll(project)` iterates through 18 section types in order

**Section Types:** title, abstract, keywords, introduction, literature-review, research-gap, research-questions, hypotheses, methodology, results, discussion, conclusion, limitations, future-work, acknowledgements, funding, ethics, conflict-of-interest, author-contributions, references

---

## 5. Manuscript Interfaces (`manuscript/interfaces/index.ts`)

| Interface | Purpose |
|-----------|---------|
| `ManuscriptSection` | Section content, type, citations, diagnostics, status |
| `PipelineStage<TInput, TOutput>` | Generic stage with name and async execute |
| `SectionBuilder` | PipelineStage<CanonicalResearchProject, ManuscriptSection> |
| `SectionValidator` | PipelineStage<ManuscriptSection, boolean> |
| `QualityChecker` | PipelineStage<ManuscriptSection, { score, issues }> |
| `ManuscriptExporter` | Export to docx, pdf, markdown, html, latex, jats, epub |

---

## 6. Architectural Review

### Duplicate Models
- **NONE VERIFIED** - Domain types are used consistently.

### Circular Dependencies
- **NONE VERIFIED** - Import graph is clean and hierarchical.

### Tight Coupling
- Manuscript interfaces import from `../project/projectModel` - this coupling is intentional (sections need project context)
- Version manager uses in-memory Map for snapshots - no persistence abstraction

### Dead Code
- `ProjectSerializer.toDatabase()` and `fromDatabase()` are placeholders
- No manuscript exporter implementations found

### Multiple Sources of Truth
- **NONE VERIFIED** - Single CRPM model with clear ownership.

### Version Compatibility Risks
- Version manager only updates schemaVersion string, no actual migration logic
- Migration hook is trivial - returns project with updated schemaVersion

### Migration Risks
- No migration scripts or data transformation logic
- Snapshots stored in-memory only (lost on page refresh)

---

## 7. Test Coverage Assessment

### Test Summary
- **Total Tests**: 177
- **Core Framework Tests**: Not found in test output
- **Failed Tests**: None directly related to core framework

### Missing Tests
- No tests for ProjectBuilder validation in `build()`
- No tests for ProjectVersionManager snapshots
- No tests for ManuscriptPipeline section building
- No integration tests for full project lifecycle

---

## 8. Known Risks

### Critical
- **No Persistent Versioning**: Snapshots stored in-memory Map are lost on page refresh
- **Placeholder Database Methods**: `toDatabase()`/`fromDatabase()` throw or return null

### High
- **Rollback Bug**: `rollback()` compares identity.id instead of version history
- **No Schema Evolution**: Migration only updates version string

### Medium
- **Single Schema Version**: Only "1.0.0" supported, no backward compatibility

### Low
- **Memory Store Fallback**: If localStorage unavailable, data not persisted

---

## 9. Remaining Unknowns

- How projects are actually persisted to localStorage in the application
- Whether there are tests for core framework in other locations
- How ManuscriptSection builders are registered in practice
- Export format implementations (no exporter implementations found)