import { describe, it, expect } from "vitest";
import { routeUsesClientAi } from "../client";

describe("routeUsesClientAi: the user's AI key is sent only to AI routes", () => {
  it.each([
    "/api/ai/agent",
    "/api/ai",
    "/api/projects/p1/agentic/draft-subsection",
    "/api/projects/p1/agentic/literature",
    "/api/projects/p1/assignment/stream-section",
    "/api/projects/p1/thesis/audit",
    "/api/projects/p1/thesis/chapter-audit",
    "/api/projects/p1/presentation/generate-deck",
    "https://scholar.example.org/api/projects/p1/agentic/draft-subsection?x=1",
  ])("sends for %s", (path) => {
    expect(routeUsesClientAi(path)).toBe(true);
  });

  it.each([
    "/api/projects",
    "/api/projects/p1",
    "/api/projects/p1/files",
    "/api/projects/p1/document",
    "/api/vault/parse-file",
    "/api/ai-access/settings",
    "/api/presentations/abc",
    "/api/auth/login",
    "/api/admin/ai/providers",
    "/api/aix",
  ])("does not send for %s", (path) => {
    expect(routeUsesClientAi(path)).toBe(false);
  });
});
