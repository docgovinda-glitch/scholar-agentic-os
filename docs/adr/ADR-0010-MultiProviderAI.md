# ADR-0010: Multi-Provider AI

## Status
Accepted

## Context
AI provider resilience without vendor lock-in.

## Decision
Multi-provider strategy through:
- Priority-based selection (user preference → privacy → local → free → paid)
- Automatic fallback on provider failure
- Health monitoring for availability detection
- Cost optimization through model selection

## Consequences
- No single point of AI failure
- Users can mix local and cloud providers
- Privacy levels enforced automatically
- Transparent cost tracking