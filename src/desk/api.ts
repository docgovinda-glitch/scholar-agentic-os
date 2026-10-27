/**
 * Desk's API client — talks only to the new-architecture project/atlas/
 * rubric/studio routes (server/routes/project.ts, server/routes/studio.ts),
 * never the legacy /api/generate proxy or server/routes/ai.ts.
 *
 * Modularized into domain files under src/desk/api/:
 * - httpClient.ts: Core authenticated fetch and SSE stream consumers
 * - ephemeralMigration.ts: Ephemeral draft in-memory lifecycle and cloud migration
 * - aiExecution.ts: Agentic LLM execution, Warden routing, Studio and Copilot client methods
 * - projectEndpoints.ts: CRUD, Rubric, Claims, Evidence, and Manuscript domain methods
 */

export * from "./api/httpClient";
export * from "./api/ephemeralMigration";
export * from "./api/aiExecution";
export * from "./api/projectEndpoints";
