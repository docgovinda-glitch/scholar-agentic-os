# Claude Handover Workspace

This `.claude` folder is the onboarding and documentation hub for AI-assisted development on the Scholar Agentic Operating System repository.

## Document Index

| File | Purpose |
|------|---------|
| **CLAUDE.md** | Operating manual for Claude Code in this repo: project identity, current status, responsibilities, workflow, and code-quality expectations. |
| **HANDOVER.md** | Current repository state, verified architecture, what's actually wired into the running app vs. implemented-but-disconnected, and immediate priorities. Start here after `CLAUDE.md`. |
| **ROADMAP.md** | Near-, medium-, and long-term objectives and milestones. |
| **ARCHITECTURE_RULES.md** | Non-negotiable structural rules and dependency constraints. |
| **DEVELOPMENT_GUIDELINES.md** | Coding standards, style, and testing conventions. |
| **DECISIONS.md** | Log of significant technical/architectural decisions (template + entries). |
| **KNOWN_LIMITATIONS.md** | Documented constraints and gaps in the current implementation. |
| **FUTURE_ENHANCEMENTS.md** | Backlog of proposed features and improvements. |
| **SESSION_LOG.md** | Chronological log of development sessions. |
| **kernel/** | Task lifecycle, engineering workflow, change/review policy, and AI-behavior rules that govern how changes are made (see `kernel/README.md`). |
| **knowledge/** | Machine-readable JSON indexes of the repository, generated for AI agents — currently stale; see `knowledge/README.md` for known gaps. |
| **scripts/** | Supporting Node scripts (`lib/` is currently empty; the `generate-knowledge`/`validate-knowledge`/`check-drift` scripts referenced by `package.json` do not exist yet). |

There is no `PROJECT_MEMORY.md` in this repository — earlier documents referenced one, but it was never carried over. Historical project narrative now lives in `HANDOVER.md` §0 and `ROADMAP.md`.

## Usage

- Review `HANDOVER.md` and `ARCHITECTURE_RULES.md` before making changes to understand the project's current state and constraints.
- Consult `DEVELOPMENT_GUIDELINES.md` for coding standards and workflows.
- Log significant decisions in `DECISIONS.md` and update `SESSION_LOG.md` after each work session.
