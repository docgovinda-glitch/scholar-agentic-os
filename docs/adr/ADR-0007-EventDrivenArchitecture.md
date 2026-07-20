# ADR-0007: Event-Driven Architecture

## Status
Accepted

## Context
Loose coupling between modules for scalability.

## Decision
EventBus pattern for cross-module communication:
- Immutable events with payloads
- Event sourcing for state changes
- Async event handlers
- Event replay capability