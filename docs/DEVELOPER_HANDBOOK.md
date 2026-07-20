# Developer Handbook

## Quick Start

```bash
npm install
npm run dev
```

## Architecture Overview

Scholar uses kernel-based Clean Architecture with 6 Operating Systems:

- AI OS (`src/ai/`)
- Knowledge OS (`src/knowledge/`)
- Research OS (`src/research/`)
- Writing OS (`src/writing/`)
- Publication OS (`src/publication/`)
- Workspace OS (`src/workspace/`)
- Collaboration OS (`src/collaboration/`)

## Kernel Pattern

All kernels follow singleton pattern with DI support:

```typescript
const kernel = MyKernel.getInstance(config);
await kernel.initialize();
const result = kernel.someOperation();
await kernel.shutdown();
```

## Development Commands

- `npm run dev` - Start development server
- `npm run build` - Production build
- `npm test` - Run all tests
- `npm run lint` - Lint check (if configured)

## Directory Structure

```
src/
├── ai/              # AI Operating System
├── knowledge/       # Knowledge Operating System  
├── research/        # Research Intelligence
├── writing/         # Writing Operating System
├── publication/     # Publication Operating System
├── workspace/       # Workspace Operating System
├── collaboration/   # Collaboration Operating System
└── orchestrator/    # Multi-Agent Orchestrator
```

## Adding New Features

1. Follow kernel pattern
2. Use singleton with DI
3. Define interfaces first
4. Export from index.ts
5. Add tests

## Testing

Run `npm test` - all 330 tests must pass.