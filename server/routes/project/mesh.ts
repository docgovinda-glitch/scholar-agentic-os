/**
 * Agent Mesh Execution API Router
 *
 * Implements docs/04-architecture/42-MULTI-AGENT-ARCHITECTURE.md §5 & §8.
 * Exposes runtime execution of in-memory agent manifests (AG-14, AG-18, AG-25, AG-26)
 * with capability verification, timeout guards, project ownership verification, and schema validation.
 */

import { Router, Request, Response } from "express";
import { asyncRoute, loadOwnedProject, getSharedStore } from "../project.ts";
import { getAgent, listAgents } from "../../../src/app/mesh/registry.ts";
import { runAgent } from "../../../src/app/mesh/executor.ts";
import { issue, revoke } from "../../../src/services/capabilities/capabilities.ts";
import type { CapabilityToken } from "../../../src/services/capabilities/types.ts";
import type { RunRecord } from "../../../src/app/mesh/types.ts";

export const meshRouter = Router({ mergeParams: true });

/**
 * In-process helper for executing an agent on a project with valid capabilities.
 */
export async function runMeshAgentForProject<TInput, TOutput>(
  projectId: string,
  agentId: string,
  input: TInput,
  userId = "conductor",
  budgetMs?: number
): Promise<RunRecord<TOutput>> {
  const agent = getAgent(agentId);
  if (!agent) {
    throw new Error(`Agent "${agentId}" is not registered in the mesh runtime.`);
  }

  // Issue narrow, ephemeral capability tokens for this run
  const issuedTokens: CapabilityToken[] = [];
  try {
    for (const permission of agent.permissions) {
      const token = issue(agent.id, permission, userId, projectId);
      issuedTokens.push(token);
    }

    const record = await runAgent(agent, input, {
      subject: agent.id,
      capabilityTokenIds: issuedTokens.map((t) => t.id),
      scope: projectId,
      budgetMs: budgetMs ?? 30000, // 30s default timeout guard
    });

    return record as RunRecord<TOutput>;
  } finally {
    // Revoke tokens immediately to prevent token reuse or escalation
    for (const token of issuedTokens) {
      try {
        revoke(token.id);
      } catch {
        // Ignore errors during token revocation cleanup
      }
    }
  }
}

/**
 * GET /api/projects/:id/mesh/agents
 * Lists all registered agent manifests and their capabilities.
 */
meshRouter.get(
  "/agents",
  asyncRoute(async (req: Request, res: Response) => {
    const store = getSharedStore();
    const project = await loadOwnedProject(store, req, res);
    if (!project) return;

    const agents = listAgents().map((manifest) => ({
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      channel: manifest.channel,
      responsibility: manifest.responsibility,
      modes: manifest.modes,
      defaultMode: manifest.defaultMode,
      permissions: manifest.permissions,
      memory: manifest.memory,
    }));

    return res.json({ success: true, count: agents.length, agents });
  })
);

/**
 * POST /api/projects/:id/mesh/run
 * Executes a specific agent manifest against provided input with strict capability checks.
 */
meshRouter.post(
  "/run",
  asyncRoute(async (req: Request, res: Response) => {
    const store = getSharedStore();
    const project = await loadOwnedProject(store, req, res);
    if (!project) return;

    const { agentId, input, budgetMs } = req.body || {};

    if (!agentId || typeof agentId !== "string") {
      return res.status(400).json({ error: "agentId is required" });
    }

    const agent = getAgent(agentId);
    if (!agent) {
      return res.status(404).json({
        error: `Agent "${agentId}" not found. Available agents: ${listAgents().map((a) => a.id).join(", ")}`,
      });
    }

    const userId = (req as unknown as { user?: { id: string } }).user?.id || "authenticated-user";

    try {
      const record = await runMeshAgentForProject(
        project.projectId,
        agentId,
        input,
        userId,
        typeof budgetMs === "number" ? budgetMs : undefined
      );

      return res.json({
        success: record.status === "completed",
        ...record,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({
        error: `Failed to execute agent "${agentId}": ${msg}`,
      });
    }
  })
);

export default meshRouter;
