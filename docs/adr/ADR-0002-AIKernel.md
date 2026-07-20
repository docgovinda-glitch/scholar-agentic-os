# ADR-0002: AIKernel

## Status
Accepted

## Context
AI operations require unified gateway with provider abstraction, caching, and fallback mechanisms.

## Decision
Implement AIKernel as the sole gateway for all AI operations with:
- Provider abstraction layer through common interface
- Router-based model selection
- Cache-first execution
- Automatic fallback on failures
- Exponential backoff for rate limiting

## Consequences
- No module outside AI subsystem communicates directly with providers
- Provider switching transparent to consumers
- Improved reliability through fallback chains
- Reduced costs through caching

## References
- T016A AI Infrastructure implementation