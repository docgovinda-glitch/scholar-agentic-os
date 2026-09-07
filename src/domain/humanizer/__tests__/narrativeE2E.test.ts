import { describe, it, expect, vi } from "vitest";
import { runHumanizerPipeline } from "../orchestration/humanizerPipeline";
import { auditHumanizerCandidate } from "../audit/auditOrchestrator";
import { createHumanizerDocument } from "../document/humanizerDocument";
import { shieldDocument } from "../protection/protectedElementExtractor";

const NARRATIVE_20_PARAGRAPHS = `At 5:17 every morning, the mountain changed color.

For three minutes, the jagged obsidian ridge turned from pitch black to a shimmering silver.

Then, as if caught in an invisible furnace, the crest flared into brilliant gold.

No scientific survey had ever explained the phenomenon.

Maya had watched the dawn ritual from her porch since she was a small child.

Her grandfather used to sit beside her on the splintered wooden bench, his tea steaming in the cold mountain air.

"The mountain remembers what people forget," he would say, staring into the mist.

As a girl, Maya had dismissed the phrase as an old man's poetry.

She believed in maps, barometric pressure, and satellite telemetry.

When she went to university in the capital, she studied structural geology and continental drift.

She learned that granite does not keep secrets, and tectonic plates do not mourn.

Yet twenty years later, after the reservoir dam collapsed into the eastern canyon, she found herself back in the valley.

The flood had wiped away the lower terraces, the timber mills, and the orchard roads.

The official inquiry concluded that the bedrock had suffered unforeseen subterranean shear.

Maya knew the reports were incomplete.

She had found her grandfather's hand-drawn field logs in a cedar chest beneath the floorboards.

The margins were filled with daily solar angles and warning notes written forty years earlier.

He had warned the engineers that the fault lines awakened with every winter thaw.

They had called him superstitious and poured forty thousand tons of reinforced concrete anyway.

Now, standing on the frost-covered gravel, Maya waited for 5:17, watching the ridge prepare to speak.`;

describe("End-to-End Verification: 20-Paragraph Narrative Story", () => {
  it("executes cohesive single-call rewrite for the 20-paragraph story, preserving paragraph count and producing a validated rewrite", async () => {
    let completerCallCount = 0;

    const mockCompleter = vi.fn().mockImplementation(async ({ userPrompt, systemPrompt }: any) => {
      completerCallCount++;
      // Verify prompt instructions instruct preservation of \n\n and narrative invariants
      expect(userPrompt).toContain("PRESERVE EXACT PARAGRAPH BREAKS SEPARATED BY DOUBLE NEWLINES");

      // Generate a genuinely humanized 20-paragraph rewrite
      const sourceParagraphs = NARRATIVE_20_PARAGRAPHS.split("\n\n");
      const rewrittenParagraphs = sourceParagraphs.map((para, idx) => {
        return `[P${idx + 1} Rewritten] ${para.replace("At 5:17 every morning", "Promptly at 5:17 each morning").replace("changed color", "shifted in hue").replace("Maya", "Maya")}`;
      });

      return JSON.stringify({
        rewrittenText: rewrittenParagraphs.join("\n\n"),
        improvements: [
          "Preserved cohesive narrative pacing across all 20 paragraphs",
          "Polished atmospheric cadence while retaining character dialogue and names",
        ],
      });
    });

    const result = await runHumanizerPipeline(NARRATIVE_20_PARAGRAPHS, {
      mode: "balanced",
      genre: "General Nonfiction",
      completer: mockCompleter,
    });

    // Invariant 1: Single cohesive LLM call, NOT 20 sequential calls
    expect(completerCallCount).toBe(1);

    // Invariant 2: Success must be true only for genuinely different, validated output
    expect(result.success).toBe(true);
    expect(result.fallbackUsed).toBe(false);
    expect(result.candidateState).toBe("REWRITE_VALIDATED");

    // Invariant 3: Output must NOT be identical to source
    expect(result.finalText.trim()).not.toBe(NARRATIVE_20_PARAGRAPHS.trim());

    // Invariant 4: Exact 20 paragraphs preserved
    const resultParagraphs = result.finalText.split(/\n{2,}/).filter(Boolean);
    expect(resultParagraphs).toHaveLength(20);

    // Invariant 5: Character name and dialogue preserved
    expect(result.finalText).toContain("Maya");
    expect(result.finalText).toContain("The mountain remembers what people forget");
  });

  it("strictly REJECTS when the model outputs identical text and never marks it as success", async () => {
    // Model echoes back identical text
    const echoCompleter = vi.fn().mockImplementation(async () => {
      return JSON.stringify({
        rewrittenText: NARRATIVE_20_PARAGRAPHS,
        improvements: [],
      });
    });

    const result = await runHumanizerPipeline(NARRATIVE_20_PARAGRAPHS, {
      mode: "balanced",
      genre: "General Nonfiction",
      completer: echoCompleter,
      maxRetries: 1,
    });

    // Invariant: An identical candidate must NEVER return success: true
    expect(result.success).toBe(false);
    expect(result.fallbackUsed).toBe(true);
    expect(result.candidateState).toBe("REWRITE_REJECTED");
    expect(result.fallbackReason).toContain("no humanization or stylistic transformation was produced");
  });

  it("delta auditor flags identical 20-paragraph text with NO_REWRITE_PRODUCED and REJECT", () => {
    const origDoc = createHumanizerDocument(NARRATIVE_20_PARAGRAPHS);
    const { shieldedDoc, registry } = shieldDocument(origDoc);

    // Candidate identical to shieldedDoc
    const identicalDoc = {
      ...shieldedDoc,
      blocks: shieldedDoc.blocks.map((b) => ({
        ...b,
        processedText: b.processedText,
      })),
    };

    const { report } = auditHumanizerCandidate(origDoc, identicalDoc, registry);

    expect(report.finalDecision).toBe("REJECT");
    expect(report.overallSeverity).toBe("ERROR");
    expect(report.candidateState).toBe("REWRITE_REJECTED");
    expect(report.findings.some((f) => f.code === "NO_REWRITE_PRODUCED")).toBe(true);
  });

  it("simulates 401/403 auth failure: immediately halts without looped calls and reports explicit failure", async () => {
    const authFailCompleter = vi.fn().mockRejectedValue(new Error("401 Unauthorized: API key invalid"));

    const result = await runHumanizerPipeline(NARRATIVE_20_PARAGRAPHS, {
      mode: "balanced",
      genre: "General Nonfiction",
      completer: authFailCompleter,
      maxRetries: 2,
    });

    // Invariant: Exactly 1 call, does not waste quota repeating auth failure
    expect(authFailCompleter).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(false);
    expect(result.fallbackUsed).toBe(true);
    expect(result.candidateState).toBe("REWRITE_REJECTED");
    expect(result.finalText).toBe(NARRATIVE_20_PARAGRAPHS);
  });

  it("simulates 429 rate limit: immediately halts and reports explicit failure", async () => {
    const rateLimitCompleter = vi
      .fn()
      .mockRejectedValue(new Error("429 RESOURCE_EXHAUSTED: Rate limit exceeded"));

    const result = await runHumanizerPipeline(NARRATIVE_20_PARAGRAPHS, {
      mode: "balanced",
      genre: "General Nonfiction",
      completer: rateLimitCompleter,
      maxRetries: 2,
    });

    // Invariant: Exactly 1 call, does not hammer rate-limited provider
    expect(rateLimitCompleter).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(false);
    expect(result.fallbackUsed).toBe(true);
    expect(result.candidateState).toBe("REWRITE_REJECTED");
    expect(result.finalText).toBe(NARRATIVE_20_PARAGRAPHS);
  });

  it("simulates validator rejection: candidate drops critical tokens or alters meaning", async () => {
    // Model produces candidate that severely alters claims or contradicts source
    const hallucinatingCompleter = vi.fn().mockImplementation(async () => {
      return JSON.stringify({
        rewrittenText: "Completely unrelated text about cooking recipes that contradicts all geological claims.",
        improvements: [],
      });
    });

    const result = await runHumanizerPipeline(NARRATIVE_20_PARAGRAPHS, {
      mode: "balanced",
      genre: "General Nonfiction",
      completer: hallucinatingCompleter,
      maxRetries: 1,
    });

    expect(result.success).toBe(false);
    expect(result.fallbackUsed).toBe(true);
    expect(result.candidateState).toBe("REWRITE_REJECTED");
    expect(result.finalText).toBe(NARRATIVE_20_PARAGRAPHS);
  });
});
