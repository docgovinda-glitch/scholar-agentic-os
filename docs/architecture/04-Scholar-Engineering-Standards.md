# Scholar Engineering Standards

## Project Structure

```
src/
├── ai/                 # AI Operating System
│   ├── core/          # AIKernel and core services
│   ├── providers/     # AI provider adapters
│   ├── router/        # AI routing and policy
│   ├── cache/         # AI caching
│   ├── telemetry/     # AI telemetry
├── research/          # Research Operating System
│   ├── discovery/     # Literature providers
│   ├── analyzers/      # Research analysis
│   ├── evidence/       # Evidence management
├── knowledge/         # Knowledge Operating System (T018)
├── writing/           # Writing Operating System (T019)
├── publication/       # Publication Operating System (T020)
└── core/             # Shared foundation
```

## Naming Conventions

- Classes: PascalCase (e.g., `ResearchIntelligenceEngine`)
- Interfaces: PascalCase with no prefix (e.g., `LiteratureProvider`)
- Functions: camelCase (e.g., `getApprovedEvidence`)
- Constants: UPPER_SNAKE_CASE (e.g., `DEFAULT_CACHE_TTL`)
- Files: PascalCase for classes, camelCase for utilities (e.g., `AIKernel.ts`, `cacheManager.ts`)

## Architecture Principles

1. **SOLID**: Single responsibility, open/closed, Liskov substitution, interface segregation, dependency inversion
2. **Clean Architecture**: Core domain independent of frameworks
3. **Dependency Injection**: All cross-module dependencies through constructor or setters
4. **Event-Driven**: Loose coupling through EventBus

## Provider Abstraction

All external services implement common interfaces:
- `LiteratureProvider` for literature discovery
- `AIProvider` for AI generation
- Providers must handle errors gracefully and report health status

## Testing Strategy

- Unit tests for all public methods
- Integration tests for cross-module communication
- Provider tests with mocked APIs
- Preserve all tests - no deletions

## Documentation Requirements

- All public APIs documented with JSDoc
- Architecture changes require ADR
- README updated for user-facing changes

## Error Handling

- Custom error types in `src/ai/errors/`
- Graceful degradation for provider failures
- Never crash on single provider failure

## Versioning

- Semantic versioning (MAJOR.MINOR.PATCH)
- Breaking changes documented in ADRs
- Deprecated APIs maintained 2 minor versions

## Coding Standards

- TypeScript strict mode
- Tailwind CSS for styling
- No inline styles except for dynamic values
- Framer Motion for animations