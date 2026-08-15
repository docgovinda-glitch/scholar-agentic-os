import { describe, it, expect, vi, afterEach } from "vitest";
import { generateCoverLetter, GatewayDenied } from "../generateCoverLetter";
import { defaultPolicy, recordConsent, markRestricted } from "../../../platform/warden/warden";
import { emptyDocument } from "../../../domain/document/model";
import { appendBlock } from "../../../domain/document/ops";
import type { JournalRequirements } from "../../../domain/journal/types";

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

const CONSENTED_POLICY = recordConsent(defaultPolicy(), "openai");

function mockModelResponse(content: string) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ choices: [{ message: { content } }] }),
  } as Response);
}

function journalRequirements(overrides: Partial<JournalRequirements> = {}): JournalRequirements {
  return {
    journalName: "Water Research",
    source: "manual",
    citationStyle: "apa7",
    requiredDeclarations: [],
    capturedAt: "2026-01-01T00:00:00.000Z",
    capturedBy: "user-1",
    ...overrides,
  };
}

function paperDocument() {
  let doc = emptyDocument("d1", "A Novel Approach to X");
  doc = appendBlock(doc, "abstract", "paragraph", "This paper presents a novel approach to X, showing a significant improvement over prior methods.");
  return doc;
}

describe("app/coverLetter: generateCoverLetter", () => {
  it("throws without calling the model when no provider/apiKey is supplied", async () => {
    global.fetch = vi.fn();
    await expect(generateCoverLetter({ document: paperDocument(), journalRequirements: journalRequirements() })).rejects.toThrow(/provider and API key/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns a cover letter stamped with the target journal's name and a fresh timestamp", async () => {
    mockModelResponse("Dear Editor,\n\nWe are pleased to submit our manuscript...\n\nSincerely,");
    const { coverLetter, usage } = await generateCoverLetter({
      document: paperDocument(),
      journalRequirements: journalRequirements({ journalName: "Nature Communications" }),
      provider: "openai",
      apiKey: "sk-test",
      policy: CONSENTED_POLICY,
    });
    expect(coverLetter.text).toContain("Dear Editor");
    expect(coverLetter.journalName).toBe("Nature Communications");
    expect(typeof coverLetter.generatedAt).toBe("string");
    expect(usage.provider).toBe("openai");
  });

  it("throws rather than saving an empty letter if the model returns nothing", async () => {
    mockModelResponse("   ");
    await expect(
      generateCoverLetter({ document: paperDocument(), journalRequirements: journalRequirements(), provider: "openai", apiKey: "sk-test", policy: CONSENTED_POLICY })
    ).rejects.toThrow(/empty cover letter/i);
  });

  it("propagates GatewayDenied for a restricted scope rather than swallowing it", async () => {
    global.fetch = vi.fn();
    const restrictedPolicy = markRestricted(defaultPolicy(), "embargoed-project");
    let caught: unknown;
    try {
      await generateCoverLetter({
        document: paperDocument(),
        journalRequirements: journalRequirements(),
        provider: "openai",
        apiKey: "sk-test",
        policy: restrictedPolicy,
        scopeId: "embargoed-project",
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(GatewayDenied);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
