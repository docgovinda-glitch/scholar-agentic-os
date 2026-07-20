# ADR-0006: Plugin Architecture

## Status
Accepted

## Context
Platform extensibility without core modification.

## Decision
Plugin system through:
- Common provider interface
- Registration through ProviderRegistry
- Lifecycle hooks in IIFE or ESM modules
- Configuration-based activation

## References
- All provider implementations