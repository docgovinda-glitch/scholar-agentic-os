import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { keyringHeader } from "../../test/aiTestKit.ts";
import type { Response } from "express";

export const TEST_USER_ID = "22222222-2222-4222-8222-222222222222";
vi.mock("../../src/middleware/auth.ts", () => ({
  requireAuth: (req: { user?: { id: string; email: string } }, _res: unknown, next: () => void) => {
    req.user = { id: TEST_USER_ID, email: "researcher@oxford.ac.uk" };
    next();
  },
}));

import request from "supertest";
import { app } from "../../../server.ts";
import { __resetProjectStoreForTests } from "../../../src/app/conductor/projectStore.ts";
import { getProjectStore, type ProjectRecord } from "../../../src/services/store/projectStore.ts";
import { parseAndRepairLLMJson } from "../../../src/shared/llmJsonParser.ts";
import { applyScholarGuardrails, normalizeUnicodeNFC, convertToBritishEnglish } from "../../../src/shared/scholarGuardrails.ts";
import {
  scrubCitations,
  scoreClaimEntailment,
  type VerifiedSourceItem,
} from "../../src/utils/citationLockScrubber.ts";
import {
  chunkDocument,
  rankChunksBM25,
  chunkAndRerankEvidence,
} from "../../src/services/semanticRagEngine.ts";
import { scholarBrain } from "../../src/services/scholarBrain.ts";
import { configureRouterBridge } from "../../src/ai/routerBridge.ts";
import { createAiFetch } from "../../src/ai/aiEndpointGuard.ts";
import { defaultAdapters } from "../../../src/platform/router/adapters.ts";
import type { AdapterChunk, ProviderAdapter } from "../../../src/platform/router/types.ts";
import { catalog } from "../../../src/app/atlas/atlas.ts";
import { initialProjectGateState, evaluateAllChaptersGating } from "../../../src/app/conductor/conductor.ts";
import { emptyDocument } from "../../../src/domain/document/model.ts";
import { emptyGraph } from "../../../src/domain/claim/graph.ts";

const originalFetch = global.fetch;

beforeEach(() => {
  __resetProjectStoreForTests();
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

async function createTestThesisProject(projectId: string = "thesis-test-p2"): Promise<string> {
  const store = getProjectStore();
  const project: ProjectRecord = {
    projectId,
    ownerId: TEST_USER_ID,
    schemaVersion: 1,
    outputTypeId: "OT-07",
    answers: {
      research_question: "How do dynamic neural field semantics alter autonomous decision latency?",
      chapters: [
        { chapterNumber: 1, title: "Introduction & Context", wordCount: 4000, targetWordCount: 5000, status: "drafting" },
        { chapterNumber: 2, title: "Literature Review", wordCount: 8000, targetWordCount: 10000, status: "drafting" },
        { chapterNumber: 3, title: "Methodology", wordCount: 5000, targetWordCount: 6000, status: "reviewed" },
        { chapterNumber: 4, title: "Empirical Results", wordCount: 0, targetWordCount: 10000, status: "not_started" },
        { chapterNumber: 5, title: "Discussion", wordCount: 0, targetWordCount: 8000, status: "not_started" },
        { chapterNumber: 6, title: "Conclusion", wordCount: 0, targetWordCount: 4000, status: "not_started" },
      ],
    },
    gates: [],
    manuscriptJob: null,
    peerReviewHistory: { rounds: [] },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await store.save(project);
  return project.projectId;
}

describe("Batch 2: Resilient AST JSON Parser (Fix 1.6)", () => {
  it("strips <think> deep reasoning blocks and markdown code fences", () => {
    const raw = `<think>
I need to produce a clean schema response for the user.
The output format must be valid JSON with key "sections".
</think>
\`\`\`json
{
  "sections": ["Introduction", "Methodology"],
  "confidence": 0.95
}
\`\`\``;

    const parsed = parseAndRepairLLMJson<{ sections: string[]; confidence: number }>(raw);
    expect(parsed).toEqual({
      sections: ["Introduction", "Methodology"],
      confidence: 0.95,
    });
  });

  it("repairs trailing commas in objects and arrays", () => {
    const raw = `
    {
      "items": [
        "hypothesis A",
        "hypothesis B",
      ],
      "valid": true,
    }
    `;
    const parsed = parseAndRepairLLMJson<{ items: string[]; valid: boolean }>(raw);
    expect(parsed.items).toHaveLength(2);
    expect(parsed.valid).toBe(true);
  });

  it("escapes unescaped control characters inside quoted string literals", () => {
    const raw = '{\n  "analysis": "Line 1\nLine 2\tTabbed content"\n}';
    const parsed = parseAndRepairLLMJson<{ analysis: string }>(raw);
    expect(parsed.analysis).toContain("Line 1");
    expect(parsed.analysis).toContain("Line 2");
  });

  it("walks characters with bracket/brace balance to ignore preamble and postamble text", () => {
    const raw = `
    Here is the audited blueprint requested:
    {"blueprintId": "BP-884", "status": "approved"}
    Please review the methodology above.
    `;
    const parsed = parseAndRepairLLMJson<{ blueprintId: string; status: string }>(raw);
    expect(parsed.blueprintId).toBe("BP-884");
    expect(parsed.status).toBe("approved");
  });

  it("returns fallback value gracefully when JSON cannot be parsed", () => {
    const invalidRaw = "Complete garbage text with no json objects at all";
    const fallback = { fallback: true };
    const parsed = parseAndRepairLLMJson(invalidRaw, fallback);
    expect(parsed).toEqual(fallback);
  });
});

describe("Batch 2: Isomorphic Scholar Guardrails (Fix 1.3)", () => {
  it("normalizes combining diacritics into canonical NFC Unicode", () => {
    // a followed by combining macron \u0304 should normalize to \u0101 (ā)
    const decomposed = "sa\u0304mdhi and prajn\u0303a";
    const normalized = normalizeUnicodeNFC(decomposed);
    expect(normalized).toBe("sāmdhi and prajña");
    expect(normalized.normalize("NFD")).not.toBe(normalized);
  });

  it("converts US spellings to British English", () => {
    const usText = "The color of the center honors the analyze protocol.";
    const ukText = convertToBritishEnglish(usText);
    expect(ukText).toContain("colour");
    expect(ukText).toContain("centre");
    expect(ukText).toContain("honours");
    expect(ukText).toContain("analyse");
  });

  it("sanitizes banned academic clichés and evaluates burstiness", () => {
    const clichesText = "This study serves as a testament to the fact that we must delve into the multifaceted tapestry of modern AI.";
    const result = applyScholarGuardrails(clichesText, { orthography: "british" });
    expect(result.text.toLowerCase()).not.toContain("delve into");
    expect(result.text.toLowerCase()).not.toContain("testament to");
    expect(result.text.toLowerCase()).not.toContain("multifaceted tapestry");
    expect(result.clichesStripped.length).toBeGreaterThanOrEqual(2);
    expect(result.burstinessMetrics).toBeDefined();
    expect(result.burstinessMetrics.averageSentenceLength).toBeGreaterThan(0);
  });
});

describe("Batch 2: Citation Scrubber & Claim Entailment (Fix 1.7)", () => {
  const verifiedSources: VerifiedSourceItem[] = [
    {
      id: "src-1",
      shortId: "SRC-1",
      title: "Attention Is All You Need",
      authors: ["Vaswani", "Shazeer", "Parmar"],
      year: 2017,
      findingsSummary: "Self-attention mechanisms replace recurrent neural networks for sequence modeling.",
    },
    {
      id: "src-2",
      shortId: "SRC-2",
      title: "BERT: Pre-training of Deep Bidirectional Transformers",
      authors: ["Devlin", "Chang", "Lee"],
      year: 2018,
      findingsSummary: "Bidirectional representations enable deep contextual language understanding.",
    },
  ];

  it("resolves [CITE:id] tokens against verified ledger into formatted APA 7 citations", () => {
    const text = "Transformers replace recurrent units [CITE:src-1].";
    const scrubbed = scrubCitations(text, verifiedSources);

    expect(scrubbed.citedSources.some((s) => s.id === "src-1")).toBe(true);
    expect(scrubbed.formattedText).toContain("Vaswani");
  });

  it("detects parenthetical (Author, Year) and narrative Author (Year) citations", () => {
    const text = "Vaswani et al. (2017) introduced multi-head attention. Subsequent research corroborated bidirectional representations (Devlin et al., 2018).";
    const scrubbed = scrubCitations(text, verifiedSources);

    expect(scrubbed.citedSources.length).toBe(2);
    expect(scrubbed.citedSources.some((s) => s.id === "src-1")).toBe(true);
    expect(scrubbed.citedSources.some((s) => s.id === "src-2")).toBe(true);
  });

  it("maps numeric bracket citations [1] to the verified ledger", () => {
    const text = "Deep attention mechanisms demonstrate sequence convergence [1].";
    const scrubbed = scrubCitations(text, verifiedSources);

    expect(scrubbed.citedSources.some((s) => s.id === "src-1")).toBe(true);
    expect(scrubbed.formattedText).toContain("Vaswani");
  });

  it("strips out-of-bounds numeric citations [99]", () => {
    const text = "Spurious claims without ledger provenance [99] are eliminated.";
    const scrubbed = scrubCitations(text, verifiedSources);

    expect(scrubbed.formattedText).not.toContain("[99]");
    expect(scrubbed.strippedCitations).toContain("[99]");
  });

  it("evaluates lexical entailment and flags unsupported claims with warning tag", () => {
    const supportedSentence = "Self-attention mechanisms replace recurrent networks for sequence modeling.";
    const unsupportedSentence = "Deep geothermal volcanic thermodynamics produce massive obsidian crystalline structures.";

    const supportedResult = scoreClaimEntailment(supportedSentence, verifiedSources[0]);
    const unsupportedResult = scoreClaimEntailment(unsupportedSentence, verifiedSources[0]);

    expect(supportedResult.score).toBeGreaterThanOrEqual(0.15);
    expect(supportedResult.supported).toBe(true);

    expect(unsupportedResult.score).toBeLessThan(0.15);
    expect(unsupportedResult.supported).toBe(false);

    // Test that scrubCitations appends the entailment warning for unsupported claims
    const claimText = "Deep geothermal volcanic thermodynamics produce massive obsidian crystalline structures (Vaswani et al., 2017).";
    const scrubbed = scrubCitations(claimText, verifiedSources);
    expect(scrubbed.formattedText).toContain("[Citation Entailment Warning — Verify Claim Against Source]");
    expect(scrubbed.entailmentWarnings.length).toBeGreaterThan(0);
  });
});

describe("Batch 2: Semantic RAG Engine (Fix 1.8 & 1.9)", () => {
  it("chunks text into 300-word paragraph boundaries", () => {
    const paragraphs = [
      Array(160).fill("Quantum decoherence limits superconducting qubit fidelity.").join(" "),
      Array(180).fill("Topological error correction stabilizes surface code thresholds.").join(" "),
      Array(140).fill("Measurement-based state preparation reduces circuit depth.").join(" "),
    ].join("\n\n");

    const chunks = chunkDocument(paragraphs, "DOC-1", "Quantum Computing Review");
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    chunks.forEach((c) => {
      expect(c.docId).toBe("DOC-1");
      expect(c.title).toBe("Quantum Computing Review");
      expect(c.wordCount).toBeGreaterThan(0);
    });
  });

  it("ranks chunks by BM25 relevance score against query", () => {
    const chunks = [
      {
        id: "chunk-1",
        docId: "doc-1",
        title: "Quantum Physics",
        text: "Quantum annealing algorithms utilize transverse field Ising Hamiltonians to explore ground state configurations.",
        wordCount: 15,
        tokenEstimate: 20,
      },
      {
        id: "chunk-2",
        docId: "doc-2",
        title: "Medieval History",
        text: "The Carolingian renaissance witnessed substantial pedagogical reforms in monastery scriptoria across Western Europe.",
        wordCount: 14,
        tokenEstimate: 19,
      },
    ];

    const ranked = rankChunksBM25("quantum annealing hamiltonians", chunks);
    expect(ranked[0].id).toBe("chunk-1");
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });

  it("chunkAndRerankEvidence filters and respects maxTokens budget", () => {
    const sources = [
      {
        id: "s1",
        title: "Epistemic Machine Learning",
        abstract: "Bayesian active learning models reduce epistemic uncertainty in deep neural networks.",
        findings: "Variance reduction was achieved across multi-agent environments with minimal compute overhead.",
      },
      {
        id: "s2",
        title: "Agricultural Economics",
        abstract: "Corn yield volatility in sub-Saharan agriculture during drought cycles.",
        findings: "Crop rotation and soil moisture retention systems mitigated systemic losses.",
      },
    ];

    const result = chunkAndRerankEvidence("Bayesian active learning epistemic uncertainty", sources, 150);
    expect(result.chunks.length).toBeGreaterThan(0);
    expect(result.chunks[0].title).toBe("Epistemic Machine Learning");
    expect(result.totalTokens).toBeLessThanOrEqual(150);
    expect(result.contextText).toContain("Bayesian");
  });
});

describe("Batch 2: SSE Streaming & ScholarBrain (Fix 1.9)", () => {
  // scholarBrain.stream runs through the AI router. A stub provider stands in
  // for the user's key so the SSE contract is tested without a network.
  const stub: ProviderAdapter = {
    async *stream(): AsyncIterable<AdapterChunk> {
      yield { type: "text", text: "Chapter four synthesises the empirical results. " };
      yield { type: "text", text: "The effect held across both cohorts." };
      yield { type: "usage", inputTokens: 40, outputTokens: 14 };
      yield { type: "finish", reason: "stop" };
    },
  };
  const keyringHeader = Buffer.from(JSON.stringify([{ provider: "openai", model: "stub-model", apiKey: "test-key" }])).toString("base64url");
  afterEach(() => configureRouterBridge({ adapters: defaultAdapters(createAiFetch()) }));

  const capture = () => {
    const writtenData: string[] = [];
    const headers: Record<string, string> = {};
    const mockRes = {
      setHeader: (key: string, value: string) => { headers[key] = value; },
      write: (data: string) => { writtenData.push(data); },
      end: () => {},
    } as unknown as Response;
    return { writtenData, headers, mockRes };
  };

  it("streams status, chunk and done events with proper headers", async () => {
    configureRouterBridge({ adapters: { openai: stub } });
    const { writtenData, headers, mockRes } = capture();
    const mockReq = {
      user: { id: TEST_USER_ID, email: "researcher@oxford.ac.uk" },
      headers: { "x-ai-keyring": keyringHeader },
      body: {},
      query: {},
    };

    await scholarBrain.stream(
      mockReq,
      {
        prompt: "Synthesize empirical results for chapter 4.",
        systemInstruction: "You are a scholarly thesis auditor.",
        temperature: 0.2,
      },
      mockRes
    );

    expect(headers["Content-Type"]).toBe("text/event-stream");
    expect(headers["Cache-Control"]).toContain("no-cache");
    expect(headers["Connection"]).toBe("keep-alive");

    const joinedStream = writtenData.join("");
    expect(joinedStream).toContain("event: status");
    expect(joinedStream).toContain("event: chunk");
    expect(joinedStream).toContain("event: done");
    expect(joinedStream).toContain('"wordCount"');
    expect(joinedStream).toContain("both cohorts");
  });

  it("with no AI connected it streams an error, never a simulated draft", async () => {
    const { writtenData, mockRes } = capture();
    await scholarBrain.stream({ user: { id: TEST_USER_ID }, headers: {}, body: {}, query: {} }, { prompt: "Draft chapter 4." }, mockRes).catch(() => undefined);
    const joinedStream = writtenData.join("");
    expect(joinedStream).toContain("event: error");
    expect(joinedStream).not.toContain("event: done");
    expect(joinedStream).not.toMatch(/simulated/i);
  });
});

describe("Batch 2: Model Capability Profiler & Mesh Preflight (Fix 1.10)", () => {


  it("validates AG-14, AG-18, AG-25, and AG-26 via validatePreflightMesh", async () => {
    const results = await scholarBrain.validatePreflightMesh(TEST_USER_ID, {
      text: "Empirical evaluation of neural decision semantics shows robust convergence.",
    });
    expect(results.allPassed).toBe(true);
    expect(results.ag18).toBeDefined();
    expect(results.ag25).toBeDefined();
  });
});

describe("Batch 2: Multi-Chapter Gating in Thesis Workspace (Fix 2.5)", () => {
  it("evaluates all chapters gating and produces chapter summaries", async () => {
    const spec = catalog.getOrThrow("OT-07");
    const project = initialProjectGateState("proj-thesis-eval");
    const doc = emptyDocument("proj-thesis-eval", spec.title);
    const claimGraph = emptyGraph();

    const evaluation = evaluateAllChaptersGating(project, {
      spec,
      document: doc,
      claimGraph,
      answers: {},
    });

    expect(evaluation.chapterSummaries.length).toBeGreaterThanOrEqual(6);
    expect(evaluation.chapterSummaries[0]).toHaveProperty("g3Status");
    expect(evaluation.chapterSummaries[0]).toHaveProperty("g4Status");
    expect(evaluation.chapterSummaries[0]).toHaveProperty("g5Status");
    expect(typeof evaluation.allChaptersReadyForG6).toBe("boolean");
  });

  it("serves gate-status and chapter-audit endpoints via express", async () => {
    const projectId = await createTestThesisProject();

    const gateRes = await request(app)
      .get(`/api/projects/${projectId}/thesis/gate-status`)
      .set("Authorization", "Bearer valid-token");

    expect(gateRes.status).toBe(200);
    expect(gateRes.body.success).toBe(true);
    expect(gateRes.body.chapterSummaries.length).toBeGreaterThan(0);
    expect(gateRes.body).toHaveProperty("allChaptersReadyForG6");

    // The audit used to fall back to a heuristic score when no AI was configured,
    // and this test relied on that. The route now needs a real AI answer
    // (PRODUCT_AUDIT P0-9), so the answer is mocked; the gate summaries it
    // returns alongside are still the deterministic ones under test here.
    vi.spyOn(scholarBrain, "complete").mockResolvedValue({
      text: "",
      parsedJson: { totalChapters: 2, alignmentScore: 70, coherenceStatus: "ok", crossChapterChecks: [] },
      provider: "openai",
      model: "test",
      wordCount: 0,
      burstinessMetrics: { averageLength: 0, variance: 0, burstinessScore: 0, isSufficientlyBurst: false },
    });
    const auditRes = await request(app)
      .post(`/api/projects/${projectId}/thesis/chapter-audit`)
      .set("Authorization", "Bearer valid-token")
      .set(keyringHeader("openai", "test-model", "sk-test-not-real"))
      .send({
        chapters: [
          { chapterNumber: 1, title: "Introduction", wordCount: 4000, targetWordCount: 5000, status: "drafting" },
          { chapterNumber: 2, title: "Literature Review", wordCount: 8000, targetWordCount: 10000, status: "drafting" },
        ],
      });

    expect(auditRes.status).toBe(200);
    expect(auditRes.body.chapterSummaries.length).toBeGreaterThan(0);
    expect(auditRes.body).toHaveProperty("alignmentScore");
  });
});
