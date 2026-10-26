import { describe, it, expect } from "vitest";
import { parseAndRepairLLMJson, stripReasoningBlocks, extractBalancedJson } from "../../../src/shared/llmJsonParser";
import {
  scrubCitations,
  scrubCitationsDetailed,
  verifyClaimEntailment,
  type VaultSource,
  UNVERIFIED_CITATION_TOKEN,
  ENTAILMENT_WARNING_TOKEN,
} from "../../src/utils/citationLockScrubber";
import {
  getModelCapabilityProfile,
  adaptPromptForModel,
  compressSystemPrompt,
} from "../../../src/shared/modelCapabilityProfile";
import { scholarGuardrails } from "../../../src/shared/scholarGuardrails";

describe("Remediation Step 2: AI Pipeline Unification & Resilient Guardrails", () => {
  describe("Task 2: parseAndRepairLLMJson", () => {
    it("strips DeepSeek R1 <think> reasoning blocks cleanly", () => {
      const raw = `<think>
I need to analyze the protocol design.
The user wants a randomized trial.
Let me formulate the JSON output now.
</think>
{
  "title": "Adaptive Clinical Trial",
  "phase": 3
}`;
      const result = parseAndRepairLLMJson<{ title: string; phase: number }>(raw);
      expect(result.title).toBe("Adaptive Clinical Trial");
      expect(result.phase).toBe(3);
    });

    it("strips markdown code fences with conversational chatter", () => {
      const raw = `Here is the requested protocol schema:
\`\`\`json
{
  "hypothesis": "Primary hypothesis H1",
  "sampleSize": 120
}
\`\`\`
Hope this helps!`;
      const result = parseAndRepairLLMJson<{ hypothesis: string; sampleSize: number }>(raw);
      expect(result.hypothesis).toBe("Primary hypothesis H1");
      expect(result.sampleSize).toBe(120);
    });

    it("repairs trailing commas before closing braces and brackets", () => {
      const raw = `{
  "items": [
    "item 1",
    "item 2",
  ],
  "author": "Scholar OS",
}`;
      const result = parseAndRepairLLMJson<{ items: string[]; author: string }>(raw);
      expect(result.items).toEqual(["item 1", "item 2"]);
      expect(result.author).toBe("Scholar OS");
    });

    it("extracts balanced JSON when braces are inside quoted strings", () => {
      const raw = `Prefix text {
  "template": "Variable with {brace_token} inside string",
  "status": "ok"
} Suffix text`;
      const result = parseAndRepairLLMJson<{ template: string; status: string }>(raw);
      expect(result.template).toBe("Variable with {brace_token} inside string");
      expect(result.status).toBe("ok");
    });

    it("applies custom validator function", () => {
      const raw = `{"count": 42}`;
      const validated = parseAndRepairLLMJson(raw, (val: unknown) => {
        const rec = val as { count?: number };
        if (typeof rec?.count !== "number") throw new Error("Invalid count");
        return { countTimesTwo: rec.count * 2 };
      });
      expect(validated.countTimesTwo).toBe(84);
    });
  });

  describe("Task 3: Citation Scrubber & NLI Entailment", () => {
    const vaultSources: VaultSource[] = [
      {
        id: "src-vaswani-2017",
        title: "Attention Is All You Need",
        author: "Vaswani, A. et al.",
        authors: ["Vaswani, Ashish", "Shazeer, Noam", "Parmar, Niki"],
        year: 2017,
        abstract: "The dominant sequence transduction models are based on complex recurrent or convolutional neural networks. We propose the Transformer, a model architecture eschewing recurrence and entirely relying on an attention mechanism.",
        findings: [
          "Transformers achieve superior quality on machine translation.",
          "The Transformer generalizes well to English constituency parsing.",
          "Training is significantly faster than recurrent networks.",
        ],
      },
      {
        id: "src-thorne-2021",
        title: "Evidence Extraction and Verification for Automated Fact Checking",
        author: "Thorne, James",
        authors: ["Thorne, James"],
        year: 2021,
        abstract: "Automated verification of claims using structured evidence extraction from trusted document repositories.",
        findings: ["NLI models can detect factual contradictions in scientific claims."],
      },
    ];

    it("verifies explicit and numeric citation tokens in Vault ledger", () => {
      const text = "Transformers rely entirely on self-attention [CITE:src-vaswani-2017] as demonstrated in [1].";
      const scrubbed = scrubCitations(text, { vaultSources });
      expect(scrubbed).toBe("Transformers rely entirely on self-attention [CITE:src-vaswani-2017] as demonstrated in [1].");
    });

    it("replaces hallucinated explicit and out-of-bounds numeric citations", () => {
      const text = "Fabricated claim [CITE:src-nonexistent] and out of bound reference [99].";
      const scrubbed = scrubCitations(text, { vaultSources });
      expect(scrubbed).toContain(UNVERIFIED_CITATION_TOKEN);
      expect(scrubbed).not.toContain("[CITE:src-nonexistent]");
      expect(scrubbed).not.toContain("[99]");
    });

    it("verifies grounded Author-Date parenthetical citations", () => {
      const text = "Modern sequence transduction relies on self-attention mechanisms (Vaswani et al., 2017).";
      const scrubbed = scrubCitations(text, { vaultSources });
      expect(scrubbed).toBe("Modern sequence transduction relies on self-attention mechanisms (Vaswani et al., 2017).");
    });

    it("strips fabricated Author-Date citations and replaces with unverified warning", () => {
      const text = "Deep neural networks are inherently flawed and obsolete (Smith & Johnson, 2023).";
      const scrubbed = scrubCitations(text, { vaultSources });
      expect(scrubbed).toBe(`Deep neural networks are inherently flawed and obsolete ${UNVERIFIED_CITATION_TOKEN}.`);
    });

    it("verifies narrative Author-Date citations like According to Thorne (2021)", () => {
      const text = "According to Thorne (2021), evidence extraction enables automated fact checking.";
      const scrubbed = scrubCitations(text, { vaultSources });
      expect(scrubbed).toBe("According to Thorne (2021), evidence extraction enables automated fact checking.");
    });

    it("flags contradiction polarity in verifyClaimEntailment", () => {
      // Claim contradicts Vaswani 2017's findings (claims Transformers completely fail/worse performance)
      const claim = "Transformers completely failed and were inferior for sequence transduction tasks.";
      const entailment = verifyClaimEntailment(claim, vaultSources[0]);
      expect(entailment.contradiction).toBe(true);
      expect(entailment.supported).toBe(false);
      expect(entailment.warning).toBe(ENTAILMENT_WARNING_TOKEN);
    });

    it("attaches entailment warning when checkEntailment is active on contradictory claims", () => {
      const text = "The Transformer architecture failed and was ineffective (Vaswani et al., 2017).";
      const scrubbed = scrubCitations(text, { vaultSources, checkEntailment: true });
      expect(scrubbed).toContain(ENTAILMENT_WARNING_TOKEN);
    });
  });

  describe("Task 4: Model Capability Profiler & Prompt Adaptation", () => {
    it("classifies local and small parameter models into compact tier", () => {
      const profile = getModelCapabilityProfile("llama3.2:3b", "ollama");
      expect(profile.tier).toBe("compact");
      expect(profile.recommendedPersonaDecomposition).toBe(true);
      expect(profile.systemPromptCompressionRatio).toBe(0.4);
    });

    it("classifies Claude 3.7 Sonnet and GPT-4o into frontier tier", () => {
      const sonnet = getModelCapabilityProfile("claude-3-7-sonnet", "anthropic");
      expect(sonnet.tier).toBe("frontier");
      expect(sonnet.recommendedPersonaDecomposition).toBe(false);

      const gpt4o = getModelCapabilityProfile("gpt-4o", "openai");
      expect(gpt4o.tier).toBe("frontier");
    });

    it("classifies Gemini Flash and Haiku into standard tier", () => {
      const gemini = getModelCapabilityProfile("gemini-2.5-flash", "google");
      expect(gemini.tier).toBe("standard");

      const haiku = getModelCapabilityProfile("claude-3-5-haiku", "anthropic");
      expect(haiku.tier).toBe("standard");
    });

    it("adapts and compresses prompts for compact tier while mandating flat JSON", () => {
      const profile = getModelCapabilityProfile("llama3.2:3b", "ollama");
      const verboseSystem = `=== SCHOLAR OS ADVANCED PROMPT ===
You are an elite academic peer reviewer with decades of experience.
Please ensure that you uphold uncompromising rigor across all facets.
Failure to adhere to these instructions will compromise paper validity.

1. METHODOLOGICAL RIGOR:
- Check sample size validity and statistical power calculations.
- Verify exclusion criteria and confounding control.

2. ORTHOGRAPHY:
- Enforce British English spelling.

Output JSON schema:
{
  "scores": {
    "nested": {
      "deep": 1
    }
  }
}`;
      const adapted = adaptPromptForModel(verboseSystem, "Review this draft.", profile);
      expect(adapted.isCompressed).toBe(true);
      expect(adapted.mandatesFlatJson).toBe(true);
      expect(adapted.systemPrompt.length).toBeLessThan(verboseSystem.length);
      expect(adapted.systemPrompt).toContain("Output flat, single-level JSON keys only");
    });
  });

  describe("Task 1: scholarGuardrails Isomorphic Guarantees", () => {
    it("enforces British spelling while preserving DOIs and URLs", () => {
      const input = "We analyze the behavior and color in https://doi.org/10.1000/182 and synthesize the center.";
      const converted = scholarGuardrails.convertToBritishEnglish(input);
      expect(converted).toContain("analyse");
      expect(converted).toContain("behaviour");
      expect(converted).toContain("colour");
      expect(converted).toContain("centre");
      expect(converted).toContain("synthesise");
      expect(converted).toContain("https://doi.org/10.1000/182");
    });

    it("replaces banned LLM cliché tokens with scholarly alternatives", () => {
      const input = "It is worth noting that we delve into the intricate tapestry of findings, a testament to our rigor.";
      const sanitized = scholarGuardrails.sanitizeScholarlyText(input, { stripCliches: true });
      expect(sanitized.toLowerCase()).not.toContain("delve");
      expect(sanitized.toLowerCase()).not.toContain("tapestry");
      expect(sanitized.toLowerCase()).not.toContain("testament");
      expect(sanitized).toContain("investigate");
      expect(sanitized).toContain("framework");
    });

    it("normalizes Unicode NFC transliterations accurately", () => {
      const original = "Śaṅkara";
      const decomposed = original.normalize("NFD");
      expect(decomposed).not.toBe(original);
      const normalized = scholarGuardrails.normalizeUnicodeNFC(decomposed);
      expect(normalized).toBe(original);
    });

    it("calculates syntactic burstiness variance", () => {
      const uniformText = "This is short. This is short. This is short.";
      const uniformMetrics = scholarGuardrails.evaluateBurstiness(uniformText);
      expect(uniformMetrics.variance).toBe(0);

      const variedText = "This is short. However, this sentence incorporates multiple clauses, demonstrating higher syntactic variance and academic epistemic hedging across complex analytical discourse.";
      const variedMetrics = scholarGuardrails.evaluateBurstiness(variedText);
      expect(variedMetrics.variance).toBeGreaterThan(0);
      expect(variedMetrics.isSufficientlyBurst).toBe(true);
    });
  });
});
