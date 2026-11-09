# Scholar Core Documentation

This folder describes the application as it exists on `main`. Where a document and the code disagree, the code is right and the document should be fixed in the same pull request that changes the code.

## Living documents

| Document | Describes |
| :--- | :--- |
| [`PRODUCT.md`](PRODUCT.md) | Capabilities, user roles, the output-type catalog and which workspaces exist |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Runtime topology, server and client layers, security model, ML style engine |
| [`WORKFLOWS.md`](WORKFLOWS.md) | Sign-in and onboarding, then each workspace step by step |
| [`AI-SYSTEM.md`](AI-SYSTEM.md) | Single brain (`scholarBrain`), the two routers, providers, credentials, local models |
| [`AI-CALL-MAP.md`](AI-CALL-MAP.md) | Entry layers that reach the AI gateway and where each gets its credentials |
| [`DATA-MODEL.md`](DATA-MODEL.md) | Postgres tables (from `supabase/`), storage buckets, project state shapes |
| [`API.md`](API.md) | Every HTTP endpoint registered by `server.ts`, with auth and rate-limit notes |
| [`UI-UX.md`](UI-UX.md) | Design tokens, themes, shell and navigation, accessibility rules |
| [`DEVELOPMENT.md`](DEVELOPMENT.md) | Local setup, commands, tests, conventions |
| [`DEPLOYMENT.md`](DEPLOYMENT.md) | Dockerfile, `render.yaml`, GitHub workflows, Supabase |
| [`presentation-studio.md`](presentation-studio.md) | Slides engine (OT-22) |

Related files at the repository root: [`README.md`](../README.md), [`CLAUDE.md`](../CLAUDE.md) (agent and contributor rules), [`SETUP.md`](../SETUP.md), [`RUNBOOK.md`](../RUNBOOK.md) (operations), [`SYSTEM_MAP.md`](../SYSTEM_MAP.md) (file map), [`e2e/README.md`](../e2e/README.md), [`CHANGELOG.md`](../CHANGELOG.md).

## Dated records (not kept in sync)

These capture a point in time (incidents, audits, plans, status ledgers). Each starts with a banner saying so. Do not treat them as a description of current behaviour.

`AUDIT.md`, `COMPROMISE_CHECKS.md`, `HOTFIX_DEPLOY.md`, `HOTFIX2_DEPLOY.md`, `MERGE_PLAN.md`, `POST_DEPLOY_80.md`, `PROD_CHECKS.md`, `PRODUCT_AUDIT.md`, `ROTATION_RUNBOOK.md`, `STATUS.md`, `USER_NOTICE.md`, `docs/COMPLETION_ROADMAP.md`.

## Keeping docs correct

- Name files, routes and commands exactly as they exist; do not quote test counts, bundle sizes or timings.
- Change a route, table, environment variable, command or workflow file: update the matching document in the same pull request.
- `CLAUDE.md` holds the short, authoritative project memory; these documents hold the detail.
