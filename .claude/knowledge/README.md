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

## Known Gaps (as of Architecture Synchronization pass — see `REPOSITORY_TRUTH_REPORT.md`)

The JSON indexes in this directory were **not** regenerated as part of this pass and are known to be stale/incomplete:

- `knowledge.schema.json` referenced above does not exist on disk yet.
- The indexes (`MODULE_INDEX.json`, `ARCHITECTURE_MAP.json`, `SERVICE_REGISTRY.json`, etc.) predate discovery of `src/orchestrator/`, `src/agents/`, `src/document_intelligence/`, `src/citation_compliance/`, `src/knowledge_vault/`, `src/auth/`, `src/core/manuscript/`, `src/core/project/`, and the entire `server/` backend — none of these are represented.
- `npm run generate:knowledge` / `validate:knowledge` / `check:knowledge` currently **fail**: `package.json` references `.claude/scripts/generate-knowledge.js`, `.claude/scripts/validate-knowledge.js`, and `.claude/scripts/check-drift.js`, none of which exist.

Regenerating these JSON indexes is out of scope for documentation-only synchronization and should be a separate, explicitly-approved task once the human-readable docs (this README, `docs/architecture/`, `.claude/*.md`) are verified accurate — see `REPOSITORY_TRUTH_REPORT.md` and `ARCHITECTURE_SYNCHRONIZATION_REPORT.md`.

## Maintenance

Run `npm run generate:knowledge` to regenerate after changes (currently non-functional — see Known Gaps above).