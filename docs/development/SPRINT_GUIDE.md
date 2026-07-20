# Sprint Guide

**Version:** 1.0.0
**Purpose:** Standard sprint workflow for consistent, quality-driven development

---

## SPRINT LIFECYCLE

Every sprint follows this exact sequence:

### 1. SELECT THE HIGHEST-PRIORITY PENDING TASK
- Open `IMPLEMENTATION_BACKLOG.md`
- Find the task with Priority P0 and Status "Pending" that has no unmet dependencies
- If multiple P0 tasks exist, select based on: critical path → user impact → implementation complexity

### 9. RUN TESTS
```bash
npm test  # Uses Vitest for ESM-compatible testing
```
- Verify all tests pass

### 2. REVIEW ARCHITECTURE
- Read the relevant interface/type definitions in `src/skills/`, `src/document_intelligence/`, or `src/citation_compliance/`
- Understand the Clean Architecture boundaries
- Identify any existing patterns to follow

### 3. REVIEW AFFECTED CODE
- Examine files listed in "Files Affected" for the selected task
- Check for existing similar implementations as reference
- Verify no duplicate implementations exist

### 4. EXPLAIN IMPLEMENTATION PLAN
Document in chat:
- Which files will be created or modified
- How the implementation follows existing patterns
- What tests will be added
- Estimated effort and complexity

### 5. IMPLEMENT ONLY ONE TASK
- **Never** implement multiple tasks in one sprint
- Follow the acceptance criteria exactly
- Use TypeScript strict mode
- Use Tailwind CSS v4 for any UI components
- Preserve all existing inline documentation

### 6. ADD OR UPDATE TESTS
- Create unit tests for all new functionality
- Use the `__tests__` folder pattern
- Include edge cases and error scenarios
- Run tests before proceeding

### 7. RUN LINT
```bash
npm run lint
```
- Fix all TypeScript errors
- Verify no type warnings

### 8. RUN BUILD
```bash
npm run build
```
- Ensure production bundle compiles
- Fix any build errors

### 9. RUN TESTS
```bash
npm test  # or manual test execution
```
- Verify all tests pass
- Ensure no regressions

### 10. UPDATE DOCUMENTATION
- Update JSDoc on new/changed interfaces
- Update the task status in `IMPLEMENTATION_BACKLOG.md`
- Add implementation notes if needed

### 11. UPDATE BACKLOG
- Change Status to "Complete" for finished task
- Update any dependent task statuses if all dependencies complete
- Add new tasks discovered during implementation

### 12. SUMMARIZE CHANGES
- Brief summary of what was implemented
- Any architectural decisions made
- Next recommended task

### 13. STOP AND WAIT FOR APPROVAL
- Do not start the next task without explicit permission
- Wait for user review and approval

---

## TASK SELECTION STRATEGY

### Priority Order:
1. **P0 tasks** blocking other P0 tasks
2. **P0 tasks** with no dependencies
3. **P0 tasks** with completed dependencies
4. **P1 tasks** on the critical path

### Dependency Resolution:
Before starting a task, verify all dependencies have Status "Complete".

### Effort Management:
- Break L-effort tasks into smaller tasks if possible
- S-effort tasks can be batched with other S-effort tasks
- M-effort tasks stand alone

---

## CODE QUALITY STANDARDS

### TypeScript Requirements:
- Strict mode throughout
- No `any` types (except for Express/external libraries)
- Prefer `unknown` with type narrowing
- Interface over type where appropriate

### Tailwind CSS Requirements:
- Use v4 classes exclusively
- No inline styles or custom CSS files
- Use semantic color names from existing codebase

### Error Handling:
- All errors must be typed (SkillError, ComplianceIssue, etc.)
- Errors must include actionable messages
- No silent failures

### Logging:
- Use `createLogger` from `src/core/logger.ts`
- Log at appropriate levels (debug, info, warn, error)
- Include context for debugging

---

## ARCHITECTURE COMPLIANCE CHECKLIST

Before implementation, verify:
- [ ] Clean Architecture boundaries respected
- [ ] Dependency direction is inward (toward core)
- [ ] Interfaces defined in appropriate `interfaces.ts` or model files
- [ ] No circular dependencies introduced
- [ ] Existing patterns followed (registry, context, result)

---

## TESTING REQUIREMENTS

Every task must include:
- [ ] Unit tests for public functions
- [ ] Edge case coverage
- [ ] Error scenario coverage
- [ ] Tests placed in `src/<module>/__tests__/`

---

## COMMIT DISCIPLINE

Each completed task should represent a commit-worthy change:
- One logical change per commit
- Clear commit message referencing task ID
- All tests passing before commit