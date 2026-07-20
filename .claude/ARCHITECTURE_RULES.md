# ARCHITECTURE_RULES.md — Scholar Agentic Operating System Architecture Constitution

## 1. Purpose

Architectural rules exist to preserve the long-term integrity and maintainability of the Scholar Agentic Operating System. The architecture represents a deliberate, well-considered design that enables independent development of operating system layers while maintaining loose coupling between components.

**Architectural consistency is more valuable than short-term implementation convenience.** This document codifies the non-negotiable principles that must be preserved across all future development, whether performed by AI agents or human developers.

---

## 2. Core Architectural Philosophy

### AI-Native Operating System

Scholar is architected as an operating system rather than a traditional application. This means:
- Each domain (AI, Research, Knowledge, Writing, Publication) operates as an independent OS layer
- Layers communicate through well-defined interfaces, not direct implementation calls
- The system provides orchestration capabilities for the entire research lifecycle

### Modular Architecture

The codebase follows a strict modular organization:
- Each module has a single, well-defined responsibility
- Modules can be developed, tested, and reasoned about independently
- Changes to one module do not require understanding of all other modules

### Domain-Driven Organization

Business capabilities are organized by domain:
- `src/ai/` contains AI Operating System concerns
- `src/research/` contains Research Operating System concerns
- `src/knowledge/` contains Knowledge Operating System concerns
- `src/writing/` contains Writing Operating System concerns
- `src/publication/` contains Publication Operating System concerns

### Separation of Concerns

- Presentation logic remains separate from business logic
- AI orchestration is separate from provider implementations
- Storage abstractions separate persistence concerns from domain logic

### Independent Operating Systems

Each OS layer can function independently:
- AI OS can operate without Research or Knowledge OS
- Research OS uses AI OS but can be tested in isolation
- Knowledge OS imports from AI OS for embeddings only

### Long-term Maintainability

Architecture decisions prioritize:
- Understanding over cleverness
- Explicitness over implicit behavior
- Documentation over tribal knowledge

### Extensibility

The system is designed for extension:
- Provider pattern enables new services without core changes
- Plugin architecture allows external functionality
- Event system enables integration without coupling

### Evolution Over Replacement

The architecture favors:
- Extending existing patterns rather than creating new ones
- Incremental improvement over rewrite
- Backward compatibility within major versions

---

## 3. Architectural Invariants

### Invariant 1: Operating Systems Remain Independent

**Rule**: No operating system may directly import from another operating system except where explicitly permitted.

**Rationale**: Maintains layer isolation and enables independent testing. Breaking this invariant creates circular dependencies and makes debugging exponentially harder.

### Invariant 2: Cross-Module Coupling Must Remain Minimal

**Rule**: Cross-module communication must occur through well-defined interfaces or the EventBus.

**Rationale**: Tight coupling prevents modules from being modified independently. Loose coupling via interfaces enables parallel development and easier refactoring.

### Invariant 3: Public APIs Must Remain Stable

**Rule**: Once published, public interfaces must not be modified without a deprecation strategy and 2-minor-version deprecation period.

**Rationale**: External code (including tests) depends on these interfaces. Breaking changes without migration paths cause regressions and frustrate users.

### Invariant 4: Shared Abstractions Must Not Be Bypassed

**Rule**: Where a shared abstraction exists (e.g., storage, providers), all modules must use it rather than implementing their own solutions.

**Rationale**: Duplication of abstractions creates inconsistency and maintenance burden. Shared abstractions provide predictable behavior and centralized optimization.

### Invariant 5: Reuse Existing Infrastructure

**Rule**: Before creating new infrastructure, examine existing patterns and extend them.

**Rationale**: The architecture already provides solutions for common concerns (storage, events, providers, caching). Creating new solutions fragments the codebase and increases cognitive load.

### Invariant 6: Business Logic Must Not Leak Into Presentation

**Rule**: Presentation components (React components, hooks) must not contain business logic.

**Rationale**: Mixing concerns makes business logic impossible to test independently. It also prevents logic reuse across different presentation layers (web, mobile, CLI).

---

## 4. Operating System Boundaries

### AI Operating System

**Responsibilities**:
- Provider management and routing
- AI generation orchestration
- Fallback and retry mechanisms
- Cost tracking and telemetry
- Response caching

**What is NOT Included**:
- Research methodology
- Knowledge graph operations
- Citation formatting
- Publication workflows

### Knowledge Operating System

**Responsibilities**:
- Knowledge object management
- Semantic search and embeddings
- Knowledge graph relationships
- KQL (Knowledge Query Language)
- Reasoning engine

**What is NOT Included**:
- Literature discovery
- Manuscript writing
- UI rendering
- Direct database access (uses abstractions)

**Permitted Dependencies**:
- AI OS (for embedding generation)

### Research Operating System

**Responsibilities**:
- Literature discovery
- Evidence review and approval
- Research framework generation
- Methodology recommendation
- Novelty analysis

**What is NOT Included**:
- Knowledge object persistence
- AI provider implementation
- Direct UI manipulation

**Permitted Dependencies**:
- AI OS (for AI assistance)

### Writing Operating System

**Responsibilities**:
- Manuscript drafting
- Outline generation
- Citation generation
- Language refinement

**What is NOT Included**:
- Research methodology
- Knowledge graph queries
- Publication submission

**Permitted Dependencies**:
- Knowledge OS (for knowledge objects)

### Publication Operating System

**Responsibilities**:
- Journal metadata management
- Journal recommendations
- Impact factor ranking
- Publication workflow

**What is NOT Included**:
- Research analysis
- Evidence review
- Manuscript drafting

### Workspace Operating System

**Responsibilities**:
- Project lifecycle management
- Multi-project support
- State persistence

**Permitted Dependencies**:
- All other OS layers (as orchestrator)

### Collaboration Operating System

**Responsibilities**:
- Team management
- User roles
- Shared workspace features

**Permitted Dependencies**:
- Workspace OS (for project context)

---

## 5. Dependency Rules

### Rule 1: Avoid Circular Dependencies

**Requirement**: The dependency graph must be a DAG (Directed Acyclic Graph). No cycles permitted.

**Enforcement**: Regular audits, ESLint rules where possible.

### Rule 2: Depend on Abstractions

**Requirement**: All cross-module dependencies must be on interfaces, not implementations.

**Pattern**:
```typescript
// Correct
import { type LiteratureProvider } from '../research/types';

// Incorrect
import { SemanticScholarProvider } from '../research/providers/semantic-scholar';
```

### Rule 3: Prefer Composition Over Inheritance

**Requirement**: Use composition for code reuse. Avoid inheritance beyond interface implementation.

**Rationale**: Composition enables runtime flexibility. Inheritance creates tight coupling and fragile hierarchies.

### Rule 4: Shared Utilities Belong in Common Modules

**Requirement**: Utilities used across domains must reside in `src/core/` or `src/utils/`.

**Examples**: Type utilities, formatting functions, shared constants.

### Rule 5: Cross-OS Communication Uses Interfaces

**Requirement**: Cross-operating system calls must use defined interfaces.

**Pattern**: `AIKernel.generate()`, `ResearchIntelligenceEngine.analyze()`, `KnowledgeRegistry.query()`.

---

## 6. Extension Principles

### Principle 1: Extend Before Create

**Requirement**: Always examine existing modules before creating new ones.

**Workflow**:
1. Identify if existing functionality satisfies the need
2. If not, check if an existing module can be extended
3. Only create new abstractions when justified

### Principle 2: Justify New Abstractions

**Requirement**: New abstractions must solve a concrete problem and be necessary.

**Questions to Answer**:
- What problem does this solve?
- Why can't existing patterns solve it?
- What is the maintenance cost?

### Principle 3: Avoid Unnecessary Framework Additions

**Requirement**: Do not add new libraries or frameworks without architecture review.

**Rationale**: Each addition increases bundle size, complexity, and maintenance burden.

### Principle 4: Prefer Incremental Evolution

**Requirement**: Make small, focused changes rather than large rewrites.

**Benefits**: Easier debugging, safer deployments, clearer audit trail.

### Principle 5: Preserve Backward Compatibility

**Requirement**: Changes must not break existing public APIs.

**Strategy**: Deprecation period, migration adapters, semantic versioning.

---

## 7. Refactoring Policy

### When Refactoring is Appropriate

Refactoring requires all of the following:
- Clear justification (performance, maintainability, security)
- Preservation of all existing functionality
- Updated documentation in relevant ADRs
- All tests passing
- Minimal disruption to dependent modules

### Refactoring Process

1. Document the rationale in an ADR
2. Create tests for current behavior
3. Implement changes incrementally
4. Update documentation
5. Verify no regressions

### What Constitutes "Significant" Refactoring

Changes requiring special review:
- Modifying public interfaces
- Changing kernel lifecycle
- Restructuring module boundaries
- Removing abstractions

---

## 8. API Stability

### Public Interfaces

All interfaces in `src/*/types.ts` are public APIs.

**Required Stability**: No modification without deprecation.

### Backward Compatibility

**Policy**: Deprecated APIs maintained for 2 minor versions.

**Implementation**: Adapter functions, compatibility shims, clear migration docs.

### Deprecation Strategy

1. Mark deprecated with `@deprecated` JSDoc
2. Provide alternative API
3. Document migration path
4. Remove in next major version

### Versioning Expectations

Follow semantic versioning:
- MAJOR: Breaking changes (rare)
- MINOR: New features, backward compatible
- PATCH: Bug fixes, backward compatible

---

## 9. Data Architecture Principles

### Storage Abstraction

**Rule**: All storage access occurs through repository abstractions.

**Backends**: Vector (embeddings), Object (documents), Search (indices), SQLite (user data).

### Data Ownership

Each domain owns its data model:
- Research OS owns ResearchQuestion, Evidence
- Knowledge OS owns KnowledgeObject, KnowledgeGraph
- Publication OS owns Journal, Submission

### Validation

All data entering the system must be validated:
- Type validation at boundaries
- Schema validation for external data
- Sanitization for user input

### Serialization

Data crossing boundaries serializes to JSON:
- Use type guards for validation
- Preserve type in serialization
- Version serialized formats

### Future Cloud Compatibility

Storage abstractions enable:
- Local-first development
- Cloud deployment without code changes
- Migration scenarios

---

## 10. AI Integration Principles

### Provider Abstraction

All AI providers implement `AIProvider` interface:
- No provider-specific code in business logic
- Easy addition of new providers
- Consistent error handling

### Pluggable Providers

Providers can be added without core changes:
- Drop-in adapter implementation
- Registration in provider registry
- No kernel modification required

### Stateless Providers

Provider implementations are stateless:
- Configuration through constructor
- No internal state mutation
- Thread-safe by design

### Orchestration Separation

AI orchestration is separate from providers:
- `AIKernel` handles routing and policy
- `AIRouter` implements fallback chains
- Providers focus on generation only

### Future Model Readiness

Architecture supports adding models:
- New models register as providers
- No core code modification required
- Model capabilities declared in metadata

---

## 11. Performance Principles

### Lazy Loading

Load resources only when needed:
- Code splitting for large modules
- Lazy initialization for optional services
- Deferred data fetching

### Efficient Rendering

React components follow best practices:
- Memo for expensive renders
- Selective state subscriptions
- Avoid unnecessary re-renders

### Scalable Architecture

Design for growth:
- Horizontal scaling via providers
- Modular development
- Independent deployment capability

### Technical Debt Minimization

Technical debt is intentional and documented:
- Minor, Medium, Major classifications
- Clear rationale for deferral
- Prioritized in backlog

---

## 12. Security Principles

### Authentication Readiness

Architecture prepared for authentication:
- User context propagated through kernels
- Role-based access control designed
- Session management hooks in place

### Authorization Boundaries

Each OS layer enforces authorization:
- Workspace OS controls project access
- Collaboration OS manages team permissions
- Knowledge OS validates ownership

### Sensitive Data Handling

Security-first data handling:
- API keys encrypted (WebCrypto API)
- No secrets in code
- Secure defaults everywhere

### Secret Management

Secrets follow security policies:
- Environment variables for configuration
- Encrypted storage for user secrets
- Never logged or exposed in errors

### Least Privilege

All components operate with minimum permissions:
- Providers use scoped keys
- Kernels request specific capabilities
- Users granted role-based access

### Secure Defaults

Default configurations are secure:
- Rate limiting enabled
- Input validation required
- Error messages sanitized

---

## 13. Documentation Rules

### Required Documentation Updates

Significant changes require updates to:

1. **Architecture Documentation** (`docs/architecture/`)
   - System architecture changes
   - New OS layer additions
   - Storage design modifications

2. **ADRs** (`docs/adr/`)
   - Architectural decisions
   - Pattern changes
   - Dependency modifications

3. **README** (`README.md`)
   - User-facing features
   - Setup changes
   - Breaking changes

4. **CHANGELOG** (`CHANGELOG.md`)
   - All significant changes
   - Feature additions
   - Bug fixes

5. **AI Handover Documents** (`.claude/`)
   - Development priorities
   - Known limitations
   - Future enhancements

---

## 14. Decision-Making Framework

When multiple implementation options exist, prioritize:

1. **Architectural Consistency** — Does this fit the existing architecture?
2. **Maintainability** — Will this be easy to understand and modify?
3. **Simplicity** — Is this the simplest solution that works?
4. **Scalability** — Can this grow with the system?
5. **Performance** — Is performance adequate without premature optimization?
6. **Development Speed** — Consider only after all other factors.

**Why This Order?**: Architecture is permanent; speed is temporary. Prioritizing speed over architecture creates long-term costs that compound over time.

---

## 15. Anti-Patterns

### God Classes

Large classes with multiple responsibilities must be decomposed.

### Duplicate Implementations

If two modules solve the same problem, they must be unified.

### Tight Coupling

Direct implementation dependencies across modules are prohibited.

### Hidden Dependencies

All dependencies must be explicit through imports or injection.

### Monolithic Modules

Modules should be focused. Large modules must be split.

### Premature Optimization

Optimize only after measuring real performance problems.

### Copy-Paste Code

Copied code indicates missing abstraction. Extract and share.

### Unnecessary Abstraction

Every abstraction has a cost. Justify before creating.

---

## 16. Architecture Review Checklist

Before merging significant changes, answer:

- [ ] Does this preserve modularity?
- [ ] Does this introduce unnecessary coupling?
- [ ] Is an existing abstraction being bypassed?
- [ ] Is documentation required?
- [ ] Are tests sufficient (unit + integration)?
- [ ] Is the implementation scalable?
- [ ] Does this violate any architectural invariants?
- [ ] Are public APIs unchanged or properly deprecated?
- [ ] Does this follow the extension principles?

---

## 17. Future Evolution Principles

### Incremental Evolution

Future development should:
- Build upon existing patterns
- Maintain backward compatibility
- Follow established conventions

### Stable Foundations

Core architecture remains stable:
- Kernel interface frozen
- Provider patterns unchanged
- Event system preserved

### Sustainable Growth

Growth follows rules:
- New OS layers follow kernel patterns
- Plugins use established extension points
- Documentation kept current

### Enterprise Readiness

Prepare for enterprise needs:
- Authentication architecture ready
- Audit logging designed
- RBAC patterns established
- Multi-tenancy considered