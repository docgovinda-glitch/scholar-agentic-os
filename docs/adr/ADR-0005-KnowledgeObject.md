# ADR-0005: KnowledgeObject

## Status
Proposed

## Context
Unified knowledge representation for all extracted research entities.

## Decision
KnowledgeObject as canonical model with:
- Identity: UUID, type, version
- Metadata: confidence, provenance, timestamps
- Relationships: supports, contradicts, extends, implements
- Lifecycle: draft -> validated -> published
- Audit: full history of changes

## References
- T018 Knowledge Intelligence implementation