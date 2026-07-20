# Code Review Checklist

**Version:** 1.0.0
**Purpose:** Reusable checklist for code quality verification

---

## 🏗️ ARCHITECTURE

### Clean Architecture
- [ ] Domain layer contains no dependencies on outer layers
- [ ] Interfaces are defined in core/domain or module interfaces.ts
- [ ] No circular dependencies introduced
- [ ] Dependency direction is inward (toward core)
- [ ] Each module has single responsibility
- [ ] Core types reused where appropriate

### SOLID Principles
- [ ] **Single Responsibility:** Each file/class has one clear purpose
- [ ] **Open/Closed:** Extension possible through interfaces/composition
- [ ] **Liskov Substitution:** Interfaces can be substituted without breaking
- [ ] **Interface Segregation:** No fat interfaces with unused methods
- [ ] **Dependency Inversion:** Abstractions not concretions

### Design Patterns
- [ ] Registry pattern used consistently (skills, parsers, formatters)
- [ ] Result/Either pattern for error handling
- [ ] Event Bus pattern for loose coupling
- [ ] Factory pattern for object creation where appropriate

---

## 🔒 TYPE SAFETY

### TypeScript Compliance
- [ ] No `any` types in business logic (Express/server code exempt)
- [ ] Prefer `unknown` + type narrowing over `any`
- [ ] All function parameters typed
- [ ] All return values typed
- [ ] Null/undefined handled explicitly
- [ ] No type assertions that bypass safety

### Interface Design
- [ ] Interfaces have clear, documented purpose
- [ ] Method signatures match documented behavior
- [ ] Optional properties marked correctly
- [ ] Index signatures justified and documented

---

## ⚠️ ERROR HANDLING

### Structured Errors
- [ ] All errors conform to SkillError, ComplianceIssue, or similar
- [ ] Errors include actionable messages
- [ ] Errors include optional suggested fixes
- [ ] Error codes are consistent and documented
- [ ] No silent failures - all errors logged or returned

### Recovery Strategy
- [ ] Validation errors caught before execution
- [ ] Timeout errors handled gracefully
- [ ] Resource errors (memory, file) handled
- [ ] Dependency errors surfaced clearly

---

## ✅ VALIDATION

### Input Validation
- [ ] All public functions validate inputs
- [ ] Validation errors returned as SkillValidationResult
- [ ] Invalid inputs rejected before processing
- [ ] Validation messages are user-friendly

### State Validation
- [ ] Model invariants enforced
- [ ] Required fields validated
- [ ] Type guards used where appropriate
- [ ] Normalization performed on inputs

---

## 📝 LOGGING

### Logger Usage
- [ ] Using `createLogger` from `src/core/logger.ts`
- [ ] Debug logs for internal operations
- [ ] Info logs for significant events
- [ ] Warn logs for recoverable issues
- [ ] Error logs for failures
- [ ] No sensitive data in logs

---

## 🧪 TESTING

### Test Coverage
- [ ] Unit tests for all public functions
- [ ] Edge cases tested (empty, null, large inputs)
- [ ] Error scenarios tested
- [ ] Test files in `__tests__` folder
- [ ] Test file naming: `*.test.ts`

### Test Quality
- [ ] Tests are deterministic (no random values)
- [ ] Tests don't depend on external services
- [ ] Mocked dependencies where necessary
- [ ] Tests document expected behavior

---

## ⚡ PERFORMANCE

### Efficiency
- [ ] No unnecessary loops or iterations
- [ ] Memory allocations reasonable
- [ ] Large documents handled in chunks
- [ ] Caching hints considered where appropriate

### Timeouts
- [ ] Long operations have timeout protection
- [ ] AbortSignal respected where applicable
- [ ] Progress callbacks for long operations

---

## 🔐 SECURITY

### Data Protection
- [ ] No API keys or secrets in code
- [ ] User data not logged
- [ ] Input sanitization performed
- [ ] XSS/Injection vectors considered

### Privacy
- [ ] Research data not transmitted without consent
- [ ] Local processing preferred for sensitive data
- [ ] Anonymization where required

---

## 📚 DOCUMENTATION

### JSDoc
- [ ] All public interfaces have JSDoc
- [ ] All public functions have JSDoc
- [ ] Parameters documented with @param
- [ ] Returns documented with @returns
- [ ] Examples provided for complex functions
- [ ] No outdated comments

### Code Comments
- [ ] Complex logic explained
- [ ] Business rules documented
- [ ] Research integrity notes preserved

---

## 🔬 RESEARCH INTEGRITY

### Citation Integrity
- [ ] No fabrication of citations or DOIs
- [ ] Verification status tracked
- [ ] Provenance preserved in _meta
- [ ] Canonical keys computed correctly

### AI Transparency
- [ ] AI-generated content clearly marked
- [ ] Sources linked to generated content
- [ ] Confidence scores included where relevant
- [ ] Human review gates respected

---

## 🛠 MAINTAINABILITY

### Code Quality
- [ ] Consistent naming conventions
- [ ] No magic numbers or strings
- [ ] Constants defined at module level
- [ ] Functions under 50 lines where possible
- [ ] Files under 500 lines where possible

### Refactoring Safety
- [ ] Pure functions where possible
- [ ] Side effects documented
- [ ] State mutations explicit
- [ ] No hidden dependencies

---

## Reviewer Sign-off

| Item | Check | Notes |
|------|-------|-------|
| Architecture Compliance | ✅ | |
| Type Safety | ✅ | |
| Error Handling | ✅ | |
| Testing | ✅ | |
| Performance | ✅ | |
| Security | ✅ | |
| Documentation | ✅ | |
| Research Integrity | ✅ | |