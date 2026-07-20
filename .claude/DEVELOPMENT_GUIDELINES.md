# DEVELOPMENT_GUIDELINES.md — Scholar Agentic Operating System Engineering Handbook

## 1. Purpose

These development guidelines establish consistent engineering practices for the Scholar Agentic Operating System. Consistent patterns across the codebase improve:

- **Maintainability** — Code can be understood and modified by any contributor
- **Scalability** — Patterns support growth without architectural drift
- **Onboarding** — New developers can quickly understand conventions
- **Long-term Project Health** — Technical debt is minimized and intentional

All code contributed to Scholar, whether by AI agents or human developers, must adhere to these standards.

---

## 2. Engineering Principles

### Simplicity

**Principle**: Prefer simple solutions that work over clever solutions that are complex.

**Rationale**: Simple code is easier to understand, debug, and extend. Complex code creates maintenance burdens that compound over time.

### Readability

**Principle**: Code should be self-documenting with clear naming and minimal cognitive load.

**Rationale**: Most code is read more than it is written. Readable code reduces onboarding time and prevents bugs.

### Maintainability

**Principle**: Every change should make the codebase easier to maintain, not harder.

**Rationale**: The cost of maintaining code continues indefinitely. Upfront investment in maintainability pays dividends over the project lifetime.

### Scalability

**Principle**: Design for growth, not just today's requirements.

**Rationale**: Research workflows are inherently variable. The system must accommodate diverse academic domains and workflows.

### Reliability

**Principle**: Code must handle failures gracefully and predictably.

**Rationale**: Research is critical work. System failures can result in lost intellectual effort. Reliability includes proper error handling and recovery.

### Extensibility

**Principle**: New features should extend existing patterns rather than requiring new paradigms.

**Rationale**: Established patterns reduce cognitive load and ensure consistency. New patterns should only be introduced when justified.

### Documentation-First Mindset

**Principle**: Documentation is a required deliverable for every significant change.

**Rationale**: Undocumented code is unusable code. Future contributors must understand the "why" behind every major decision.

### Incremental Development

**Principle**: Make small, focused changes that can be tested independently.

**Rationale**: Large changes are harder to debug and review. Incremental changes enable safer deployments and faster iteration.

### Quality Over Speed

**Principle**: Never sacrifice code quality for implementation speed.

**Rationale**: The architecture is the project's most valuable asset. Rushed changes create technical debt that slows future development.

---

## 3. Technology Standards

### TypeScript

- Use TypeScript strict mode for all code
- Prefer `interface` over `type` for object contracts
- Use `unknown` over `any` for unknown types
- Enable strict null checks and strict undefined checks

### React

- Use React 19 with hooks for state management
- Use functional components exclusively (no class components)
- Prefer composition over inheritance
- Use Context for cross-component state

### Vite & Build Tools

- Vite for development server and build
- Use Vite middleware in development
- Serve static assets in production

### Tailwind CSS

- Tailwind CSS v4 for all styling
- No inline styles except for dynamic values
- No custom CSS files unless absolutely necessary
- Use utility-first approach consistently

### Node.js & Express

- Node.js for backend runtime
- Express.js for API server
- Use Vite dev middleware in development
- Serve static assets in production

### Package Management

- npm for package management
- Lockfile (`package-lock.json`) must be committed
- Dependencies pinned to specific versions

---

## 4. Project Structure Guidelines

### Feature Organization

Organize features by domain:
```
src/
├── ai/          # AI Operating System
├── research/    # Research Operating System
├── knowledge/   # Knowledge Operating System
├── writing/     # Writing Operating System
├── publication/ # Publication Operating System
├── workspace/   # Workspace Operating System
└── core/        # Shared foundation
```

### Shared Utilities

Place in `src/core/` or `src/utils/`:
- Type utilities
- Formatting functions
- Common constants
- Helper functions used across domains

### Components

- Place in `src/components/`
- Follow naming: `PascalCase`
- Keep business logic out of components
- Use hooks for state and effects

### Services

- Place in `src/services/`
- One service per domain concern
- Export through `index.ts` barrel file

### Hooks

- Place in `src/hooks/`
- Prefix with `use` (e.g., `useAuth.ts`)
- Return typed values and callbacks

### Types

- Place in `src/types.ts` or `src/*/types.ts`
- Export all public types
- Use interfaces for contracts

### Configuration

- Environment variables for runtime config
- Static config in dedicated files
- No secrets in code

### Documentation

- Architecture in `docs/architecture/`
- ADRs in `docs/adr/`
- Handover in `.claude/`

### Tests

- Place adjacent to code or in `__tests__/`
- Mirror source structure
- Include unit and integration tests

---

## 5. Coding Standards

### Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Classes / Interfaces | PascalCase | `ResearchIntelligenceEngine` |
| Functions | camelCase | `getApprovedEvidence` |
| Constants | UPPER_SNAKE_CASE | `DEFAULT_CACHE_TTL` |
| Types | PascalCase | `LiteratureProvider` |
| Enums | PascalCase | `LifecyclePhase` |
| Enum Values | UPPER_SNAKE_CASE | `DRAFT`, `ACTIVE` |

### File Naming

- Classes/Components: PascalCase (`AIKernel.ts`)
- Utilities: camelCase (`cacheManager.ts`)
- Types: camelCase (`types.ts`)
- Tests: mirror source (`cacheManager.test.ts`)

### Folder Naming

- Use camelCase for multi-word folders
- Group related files together
- Keep folder hierarchy shallow (max 3 levels)

### Function Naming

- Use verbs for actions: `generate()`, `analyze()`, `validate()`
- Use nouns for accessors: `getEvidence()`, `getReports()`
- Boolean functions prefixed with `is`, `has`, `can`: `isValid()`, `hasApprovedEvidence()`

### Error Handling

- Use custom error types where appropriate
- Provide clear, actionable error messages
- Never expose secrets in errors
- Handle provider failures gracefully

### Comments

- JSDoc for all public APIs
- Inline comments for complex logic
- Avoid redundant comments (code should be self-documenting)
- Use TODO/FIXME for future work (with ticket references)

### Self-Documenting Code

- Functions should have one clear responsibility
- Names should reveal intent
- Types should constrain valid values
- Magic numbers should be named constants

---

## 6. TypeScript Best Practices

### Strong Typing

- Never use `any` without explicit justification
- Use `unknown` for external/unsafe inputs
- Enable `noImplicitAny` and `strict`
- Use type guards for runtime validation

### Prefer Interfaces

```typescript
// Correct
interface LiteratureProvider {
  search(query: string): Promise<Publication[]>;
  health(): Promise<HealthStatus>;
}

// Avoid
type LiteratureProvider = {
  search(query: string): Promise<Publication[]>;
  health(): Promise<HealthStatus>;
};
```

### Generic Programming

- Use generics for reusable utilities
- Type parameters named with single uppercase letter: `T`, `K`, `V`
- Constrain generics with interfaces where meaningful

### Type Safety

- Use exhaustive switches with `never` check:
```typescript
switch (phase) {
  case 'draft': return ...;
  case 'active': return ...;
  case 'completed': return ...;
  default: throw new Error(`Unknown phase: ${phase as never}`);
}
```

- Validate external JSON with type guards
- Use `as const` for literal types

### Strict Compiler Settings

Ensure `tsconfig.json` includes:
```json
{
  "strict": true,
  "noImplicitAny": true,
  "strictNullChecks": true,
  "strictUndefinedChecks": true,
  "noUnusedLocals": true,
  "noUnusedParameters": true
}
```

---

## 7. React & Next.js Guidelines

### Component Design

- One component, one responsibility
- Presentational vs Container pattern
- Props typed with interfaces
- Default props for optional values

### State Management

- Use `useState` for local component state
- Use `useReducer` for complex state logic
- Use Context for cross-component state
- Avoid prop drilling beyond 2 levels

### Hooks

- Custom hooks in `src/hooks/`
- Return typed values and callbacks
- Handle cleanup in useEffect
- Memoize expensive computations

### Performance

- Use `React.memo` for expensive renders
- Use `useCallback` for stable references
- Use `useMemo` for computed values
- Lazy load components where beneficial

### Reusability

- Extract reusable logic to custom hooks
- Extract reusable UI to shared components
- Use Tailwind classes consistently
- Avoid component-specific styling

### Accessibility

- All interactive elements must be keyboard accessible
- Use semantic HTML elements
- Provide aria labels where needed
- Ensure color contrast meets WCAG standards

---

## 8. Error Handling Strategy

### User-Facing Errors

- Clear, actionable messages
- No technical jargon exposed
- Guidance on how to resolve

### Internal Logging

- Log errors with context
- Include correlation IDs
- Never log secrets or PII
- Use structured logging format

### Recovery Strategies

- Graceful degradation for provider failures
- Fallback to cached responses where appropriate
- Retry with exponential backoff for transient errors
- Circuit breaker for failing providers

### Validation

- Validate at system boundaries
- Type guards for external JSON
- Schema validation for API responses
- Sanitization for user input

### Defensive Programming

```typescript
// Check inputs
if (!query || query.length === 0) {
  throw new ValidationError('Query cannot be empty');
}

// Handle undefined
const result = data?.items ?? [];

// Type guard for external data
if (!isPublication(data)) {
  throw new ValidationError('Invalid publication data');
}
```

---

## 9. Performance Expectations

### Efficient Rendering

- Memoize expensive components
- Avoid unnecessary re-renders
- Use selective state subscriptions
- Profile before optimizing

### Lazy Loading

- Code-split large modules
- Lazy load optional features
- Defer non-critical data fetching
- Use React.lazy for component splitting

### Memoization

- Use `useMemo` for computed values
- Use `useCallback` for stable callbacks
- Only memoize when computation is expensive
- Don't over-memoize (hurts more than helps)

### Bundle Optimization

- Tree-shake unused code
- Use dynamic imports sparingly
- Monitor bundle size in CI
- Split vendor and application code

### Premature Optimization

- Measure before optimizing
- Profile actual bottlenecks
- Document optimization rationale
- Prefer readable code over clever optimization

### Resource Management

- Clean up subscriptions and timers
- Cancel pending promises on unmount
- Release resources proactively
- Handle large data without blocking UI

---

## 10. Documentation Standards

### Required Documentation

Document major features, new modules, architectural changes, APIs, complex algorithms, and configuration changes.

### When to Update README

- User-facing feature additions
- Setup or configuration changes
- Breaking changes
- Major workflow modifications

### When to Create ADRs

- Architectural decisions
- Pattern changes
- Dependency modifications
- Cross-module changes

### When to Update Architecture

- System architecture changes
- New OS layer additions
- Storage design modifications
- Security model changes

### Inline Documentation

- JSDoc for all public APIs
- Complex logic explained inline
- TODO comments include ticket references
- Type documentation for unions and generics

---

## 11. Testing Standards

### Unit Tests

- Test all public methods
- Test edge cases and error paths
- Use descriptive test names
- Keep tests focused (one assertion per test where practical)

### Integration Tests

- Test cross-module communication
- Test provider integration points
- Verify workflow end-to-end

### Regression Testing

- Existing tests must continue passing
- Add regression tests for fixed bugs
- Run full suite before merges

### Build Verification

- `npm run build` must succeed
- TypeScript must compile without errors
- No console warnings in production build

### Test Coverage Philosophy

- Focus on critical paths and public APIs
- Not every line needs a test
- Complex logic deserves tests
- Tests are for confidence, not metrics

### Mandatory Requirements

- Build must succeed
- All tests must pass
- No regressions introduced

---

## 12. Code Review Checklist

### Architecture
- [ ] Architecture preserved (no boundary violations)
- [ ] Appropriate abstraction used

### Code Quality
- [ ] Naming consistent with conventions
- [ ] Strong typing maintained
- [ ] Error handling complete
- [ ] No dead code or TODOs without tickets

### Documentation
- [ ] Public APIs documented
- [ ] README updated for user-facing changes
- [ ] ADR created for architectural changes

### Tests
- [ ] Tests added for new functionality
- [ ] All tests passing
- [ ] Build succeeds

### Performance
- [ ] Rendering optimized
- [ ] No unnecessary re-renders
- [ ] Resources cleaned up

### Security
- [ ] No secrets in code
- [ ] Input validation present
- [ ] Error messages sanitized

---

## 13. Git Workflow

### Small Incremental Changes

- Make small, focused commits
- Each commit should do one thing
- Avoid mixing concerns in single commits

### Logical Commits

- Use present tense imperative: "Add feature" not "Added feature"
- Reference tickets where applicable
- Keep commits atomic

### Descriptive Messages

```
Add KnowledgeRegistry for object management

Create registry module following established patterns
from ResearchIntelligenceEngine. Adds KQL support
for querying. Part of T018.

Refs: ADR-0004, T018
```

### Local Testing

- Run `npm run build` before committing
- Run `npm test` to verify no regressions
- Manual test critical user flows

### Clean Working Tree

- No uncommitted changes before pull
- Stash or branch for WIP
- Clean commit history

---

## 14. Issue Resolution

### Resolution Workflow

1. **Reproduce** — Create a test case that demonstrates the issue
2. **Understand Root Cause** — Trace through code to find the source
3. **Design Solution** — Plan the fix with minimal impact
4. **Implement** — Apply fix incrementally
5. **Test** — Verify fix and ensure no regressions
6. **Document** — Update relevant documentation

### Analysis Before Fix

- Understand the problem fully before attempting a fix
- Check for related issues or patterns
- Identify if this is a symptom of a larger problem
- Consider architectural implications

---

## 15. Feature Development Workflow

### Development Process

1. **Understand Requirements** — Clarify scope and constraints
2. **Review Architecture** — Check existing patterns and boundaries
3. **Plan Implementation** — Create implementation plan with milestones
4. **Identify Affected Modules** — Map out what will change
5. **Implement Incrementally** — Small changes, frequent verification
6. **Test Thoroughly** — Unit and integration tests
7. **Update Documentation** — README, ADR, architecture as needed
8. **Summarize Changes** — Clear summary of what was done

### Planning Required

- Significant architectural changes require plan before implementation
- Extension of existing patterns can proceed incrementally
- New abstractions require justification

---

## 16. Refactoring Guidelines

### Appropriate Refactoring

Refactoring is appropriate when:
- Improving code quality without changing behavior
- Preparing for new features
- Eliminating technical debt
- Following established patterns

### Refactoring Requirements

- Clear objective stated upfront
- No functional regressions
- Architecture preserved
- Tests updated or added
- Documentation updated

### Safe Refactoring

- Refactor one thing at a time
- Run tests after each change
- Profile before optimizing
- Document rationale in ADR if architectural

---

## 17. Security Practices

### Input Validation

- Validate all external input
- Use type guards for API responses
- Sanitize user-provided content
- Validate file uploads

### Secret Management

- Use environment variables for secrets
- Never commit secrets to repository
- Encrypt secrets at rest
- Rotate keys regularly

### Authentication Readiness

- Architecture supports future auth layer
- User context flows through kernels
- Roles and permissions designed
- Sessions designed for stateless operation

### Authorization Boundaries

- Each OS layer validates permissions
- Workspace OS controls project access
- Knowledge OS validates ownership
- No unauthorized data access

### Sensitive Data

- PII never logged
- API keys never in code
- Errors don't expose internals
- Data encrypted in transit

### Secure Defaults

- Rate limiting on all endpoints
- CORS configured restrictively
- Input validation required
- Secure headers enabled

---

## 18. Accessibility & UX Expectations

### Accessibility

- All interactive elements keyboard accessible
- Semantic HTML for screen readers
- Color contrast meets WCAG 2.1 AA
- Focus indicators visible

### Responsive Design

- Mobile-first approach
- Flexible layouts with CSS Grid/Flexbox
- Touch targets minimum 44x44
- No horizontal scroll

### Keyboard Navigation

- All actions reachable via keyboard
- Logical tab order
- Escape closes modals
- Arrow keys for menus

### User Feedback

- Loading states for async operations
- Clear error messages
- Success confirmations
- Progress indicators for long operations

### Consistent UI Patterns

- Reusable components in `src/components/`
- Consistent spacing with Tailwind scale
- Standard animation patterns
- Accessible color palette

---

## 19. AI-Assisted Development Guidelines

### Understand Before Modifying

- Read architecture before coding
- Understand existing patterns
- Identify the right layer for changes
- Check for existing implementations

### Extend Before Replace

- Prefer extending existing modules
- Avoid unnecessary rewrites
- Follow established conventions
- Maintain backward compatibility

### Explain Significant Decisions

- Document architectural choices
- Create ADRs for pattern changes
- Explain trade-offs considered
- Get approval for major changes

### Keep Changes Reviewable

- Small, focused changes
- Clear commit messages
- Incremental implementation
- Avoid large PRs without breakdown

### Maintain Consistency

- Follow coding standards
- Use established patterns
- Match existing code style
- Respect architectural boundaries

---

## 20. Definition of High-Quality Contribution

A contribution to Scholar is high-quality when:

1. **Solves the Intended Problem** — Addresses the requirement fully and correctly
2. **Preserves Architecture** — Respects module boundaries and patterns
3. **Follows Coding Standards** — Consistent naming, typing, and style
4. **Passes Builds and Tests** — No regressions, all tests passing
5. **Updates Documentation** — README, ADRs, architecture as needed
6. **Improves Maintainability** — Code is cleaner or better documented after the change
7. **Ensures Security** — No vulnerabilities introduced
8. **Considers Performance** — No unnecessary degradation
9. **Maintains Accessibility** — No accessibility regressions