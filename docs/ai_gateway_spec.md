# AI Gateway Spec
`AIGateway.generate(params, settings)` returns `{ text, provider, model, inputWords, outputWords, latencyMs }`. Supports health checks via `AIGateway.healthCheckAll()`.