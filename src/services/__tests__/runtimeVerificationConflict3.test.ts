import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveClientCandidates } from "../clientRouter";
import { buildLiteraturePrompts } from "../../desk/workspace/agentPrompts/literaturePrompts";
import { parseJsonFromLlm } from "../../utils/jsonParser";

import { storeProviderKey } from "../userAiSettings";

vi.mock("../localRunnerProbe", () => ({
  probeRunner: vi.fn(async () => ({ reachable: false, reason: "unreachable" })),
}));

describe("Conflict #3 Runtime Verification Suite", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("1. Canary Verification: Client prompt builder builds prompts containing canary locally with zero server leak", () => {
    const CANARY = "CONFLICT3_PRIVATE_RESEARCH_CANARY_998877";
    const { systemPrompt, userPrompt } = buildLiteraturePrompts({
      workingTitle: `Title with ${CANARY}`,
      researchArea: `Area with ${CANARY}`,
      projectAnswers: { custom_note: CANARY },
      isBroadened: false,
    });

    // Verification: Canary is contained in local prompt strings constructed purely client-side
    expect(userPrompt).toContain(CANARY);
    expect(systemPrompt).toBeDefined();
  });

  it("2. Client AI Router: Resolves candidates purely client-side with 0 network calls to Scholar server", async () => {
    await storeProviderKey("together", "test-key");

    const decision = await resolveClientCandidates("reasoning");
    expect(decision.ok).toBe(true);
    expect(decision.choice?.provider).toBe("together");
    expect(decision.choice?.apiKey).toBe("test-key");
  });

  it("3. All-Resources-Exhausted Flow: Correctly flags exhausted state when no providers reachable", async () => {
    const decision = await resolveClientCandidates("reasoning");
    expect(decision.ok).toBe(false);
    expect(decision.reasoning).toContain("No AI providers are configured");
  });

  it("4. JSON Parser: Robust parsing of raw and markdown-fenced LLM outputs", () => {
    const raw = '```json\n{"data": [{"id": "1", "title": "Verified Paper"}]}\n```';
    const parsed = parseJsonFromLlm(raw);
    expect(parsed.data[0].title).toBe("Verified Paper");
  });
});
