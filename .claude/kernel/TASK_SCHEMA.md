# TASK_SCHEMA.md — Task Lifecycle Definition

## Task Stages

| Stage | Description | Required Deliverables |
|-------|-------------|----------------------|
| **Requested** | Task received from user | Clear requirements, scope defined |
| **Planned** | Implementation approach documented | Plan, affected files identified |
| **Approved** | Change authorized | Approval confirmation |
| **In Progress** | Implementation active | Code changes, incremental commits |
| **Testing** | Verification in progress | Tests run, build verified |
| **Documentation** | Documentation updated | Docs, ADR if architectural |
| **Completed** | Task delivered | Summary, no known regressions |
| **Archived** | Historical record stored | Reference in SESSION_LOG.md |

## Quality Gates

Each stage must pass before proceeding to next.