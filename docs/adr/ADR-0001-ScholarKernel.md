# ADR-0001: ScholarKernel

## Status
Accepted

## Context
The Scholar Agentic Operating System requires a central orchestrator to manage kernel lifecycle and cross-kernel communication.

## Decision
Implement ScholarKernel as the central orchestrator with:
- Kernel registry and discovery
- Lifecycle management (initialize, shutdown)
- Health monitoring and metrics aggregation
- Cross-kernel event routing
- Dependency resolution

## Consequences
- Single point of control for platform initialization
- Enables modular kernel addition/removal
- Provides centralized observability
- Allows graceful shutdown of all services

## References
- T002 Foundation Platform implementation