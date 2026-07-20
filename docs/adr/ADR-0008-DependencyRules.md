# ADR-0008: Dependency Rules

## Status
Accepted

## Context
Preventing circular dependencies and architectural drift.

## Decision
Dependency hierarchy:
- Foundation has no dependencies
- AI Kernel depends only on Foundation
- Research Kernel depends on AI Kernel and Foundation
- Knowledge Kernel depends on AI Kernel and Research Kernel
- No upward dependencies allowed