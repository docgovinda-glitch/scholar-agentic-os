# ADR-0003: ResearchIntelligenceEngine

## Status
Accepted

## Context
Research reasoning requires unified engine that consumes only approved evidence.

## Decision
Implement ResearchIntelligenceEngine that:
- Accepts only Pre-approved evidence from EvidenceReviewWorkspace
- Uses AIKernel exclusively for AI operations
- Generates reproducible research outputs
- Maintains traceable reasoning paths

## Consequences
- Research conclusions always explainable
- No direct literature access outside discovery flow
- Consistent quality through AIKernel policies