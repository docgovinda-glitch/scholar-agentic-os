# AI Knowledge Layer — Scholar Agentic Operating System

## Purpose

Machine-readable semantic representation of the repository for AI assistants.

## Files

| File | Purpose |
|------|---------|
| `knowledge.version.json` | Version metadata |
| `AI_CONTEXT.json` | Quick overview for AI agents |
| `REPOSITORY_MANIFEST.json` | Repository structure |
| `MODULE_INDEX.json` | Module catalog |
| `ARCHITECTURE_MAP.json` | Architecture layers |
| `SERVICE_REGISTRY.json` | Service endpoints |
| `API_INDEX.json` | API endpoints |
| `EVENT_MAP.json` | System events |
| `ENTRY_POINTS.json` | Build/test entry points |
| `WORKFLOW_INDEX.json` | User workflows |
| `COMMANDS.json` | CLI commands |
| `AI_AGENT_GUIDE.json` | AI operational guidance |
| `knowledge.schema.json` | JSON Schema for validation |

## Reading Order for AI Agents

1. `AI_CONTEXT.json` - Repository overview
2. `MODULE_INDEX.json` - Module structure
3. `ARCHITECTURE_MAP.json` - System architecture
4. `SERVICE_REGISTRY.json` - Service relationships

## Known Gaps

The JSON indexes in this directory are stale and the scripts that would regenerate them do not exist:

- `knowledge.schema.json` referenced above does not exist on disk.
- The indexes (`MODULE_INDEX.json`, `ARCHITECTURE_MAP.json`, `SERVICE_REGISTRY.json`, etc.) predate `src/orchestrator/`, `src/agents/`, `src/document_intelligence/`, `src/citation_compliance/`, `src/knowledge_vault/`, `src/auth/`, `src/core/manuscript/`, `src/core/project/`, and the entire `server/` backend — none of these are represented.
- `npm run generate:knowledge` / `validate:knowledge` / `check:knowledge` currently **fail**: `package.json` references `.claude/scripts/generate-knowledge.js`, `.claude/scripts/validate-knowledge.js`, and `.claude/scripts/check-drift.js`, none of which exist in `.claude/scripts/` (only an empty `lib/` subdirectory is present).

Regenerating these JSON indexes is a separate, larger task — treat the human-readable docs (`docs/architecture/`, `.claude/*.md`, this README) as the source of truth until then, not these JSON files.

## Maintenance

Currently non-functional — see Known Gaps above. Restoring `npm run generate:knowledge` requires writing `.claude/scripts/generate-knowledge.js` (and its `validate-`/`check-drift` counterparts) from scratch.