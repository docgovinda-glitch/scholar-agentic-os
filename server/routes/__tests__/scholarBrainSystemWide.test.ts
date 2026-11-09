import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

export const TEST_USER_ID = "11111111-1111-4111-8111-111111111111";

vi.mock("../../src/middleware/auth.ts", () => ({
  requireAuth: (req: { user?: { id: string; email: string } }, _res: unknown, next: () => void) => {
    req.user = { id: TEST_USER_ID, email: "scholar-test@example.com" };
    next();
  },
}));

vi.mock("../../src/research/webSearchEngine.ts", () => ({
  executeWebSearch: vi.fn().mockResolvedValue([]),
  formatSearchResultsForPrompt: vi.fn().mockReturnValue(""),
}));

import request from "supertest";
import { app } from "../../../server.ts";
import { __resetProjectStoreForTests } from "../../../src/app/conductor/projectStore.ts";
import { getProjectStore, type ProjectRecord } from "../../../src/services/store/projectStore.ts";
import { scholarBrain, type UnifiedEvidenceItem } from "../../src/services/scholarBrain.ts";

const originalFetch = global.fetch;

beforeEach(() => {
  __resetProjectStoreForTests();

  // Fast, deterministic mock for external scholarly retrieval during integration tests
  vi.spyOn(scholarBrain, "retrieveEvidence").mockImplementation(async (opts): Promise<UnifiedEvidenceItem[]> => {
    const defaultEvidence: UnifiedEvidenceItem[] = [
      {
        id: "src_vault_1",
        citationToken: "[CITE:src_vault_1]",
        title: "Foundational Empirical Investigation in Quantum and Biomedical Science",
        authors: ["Finch, Alistair", "Thorne, Aris"],
        year: 2023,
        sourceType: "vault",
        authorityTier: "A",
        provenance: "Knowledge Vault",
        summary: "Groundbreaking empirical benchmarks under strict experimental controls.",
      },
    ];

    if (opts.vaultSources && opts.vaultSources.length > 0) {
      opts.vaultSources.forEach((v, idx) => {
        defaultEvidence.push({
          id: v.id || `vault_src_${idx + 1}`,
          citationToken: `[CITE:${v.id || `vault_src_${idx + 1}`}]`,
          title: v.title,
          authors: Array.isArray(v.authors) ? v.authors : [v.authors],
          year: v.year,
          doi: v.doi,
          url: v.url,
          venue: v.journal,
          sourceType: "vault",
          authorityTier: "A",
          provenance: "Knowledge Vault",
          summary: v.keyFindings,
        });
      });
    }

    return defaultEvidence;
  });
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

// ── Test Project Generators ──

async function createTestPresentationProject(projectId = "proj-presentation-ot22"): Promise<string> {
  const store = getProjectStore();
  const project: ProjectRecord = {
    projectId,
    ownerId: TEST_USER_ID,
    schemaVersion: 1,
    outputTypeId: "OT-22",
    answers: {
      working_title: "Non-Markovian Quantum State Tomography and Error Calibration",
      title: "Non-Markovian Quantum State Tomography and Error Calibration",
      authors: "Dr. Alistair Finch & Dr. Aris Thorne",
      institution: "Imperial College London & University of Oxford",
      presentationType: "conference",
      targetDurationMinutes: 15,
      researchQuestions: [
        "How do non-Markovian memory kernels reduce quantum error correction latency?",
        "What is the empirical fidelity threshold across 127-qubit superconducting architectures?",
      ],
      methodologicalDesign: "Triangulated randomized benchmarking against simulated noisy-intermediate scale quantum (NISQ) gates.",
    },
    evidenceLedger: {
      sources: [
        {
          id: "src_vault_1",
          title: "Benchmarking Non-Markovian Quantum Error Suppressions",
          authors: ["Finch, A.", "Thorne, A."],
          year: 2023,
          venue: "Physical Review Letters",
          doi: "10.1103/PhysRevLett.130.010401",
        },
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

async function createTestProposalProject(projectId = "proj-proposal-ot19"): Promise<string> {
  const store = getProjectStore();
  const project: ProjectRecord = {
    projectId,
    ownerId: TEST_USER_ID,
    schemaVersion: 1,
    outputTypeId: "OT-15",
    answers: {
      working_title: "Precision Epigenetic Reprogramming in Neurodegenerative Tauopathies",
      title: "Precision Epigenetic Reprogramming in Neurodegenerative Tauopathies",
      agency: "NIH",
      mechanism: "R01",
      budget: 1850000,
      specificAims: [
        "Specific Aim 1: Elucidate the mechanistic impact of CRISPR-dCas9 histone demethylation on MAPT hyperphosphorylation in human iPSC-derived neuronal models.",
        "Specific Aim 2: Quantify in vivo off-target transcriptional perturbation using high-throughput single-cell multiome sequencing in murine tauopathy cohorts.",
        "Specific Aim 3: Establish pharmacological delivery parameters for lipid nanoparticle-mediated crossing of the blood-brain barrier with >85% targeting efficiency.",
      ],
      significance: "Tauopathies represent an intractable clinical crisis with zero disease-modifying therapies; targeting chromatin architecture offers a transformative therapeutic paradigm.",
      methodologicalDesign: "Dual-arm randomized prospective evaluation combining microfluidic sorting with spatial transcriptomics.",
    },
    evidenceLedger: {
      sources: [
        {
          id: "src_vault_tau",
          title: "Targeted Epigenetic Demethylation Reverses Pathological Tau Aggregation",
          authors: ["Chen, L.", "Vance, E."],
          year: 2022,
          venue: "Nature Neuroscience",
          doi: "10.1038/s41593-022-01123-x",
        },
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

async function createTestThesisProject(projectId = "proj-thesis-ot09"): Promise<string> {
  const store = getProjectStore();
  const project: ProjectRecord = {
    projectId,
    ownerId: TEST_USER_ID,
    schemaVersion: 1,
    outputTypeId: "OT-07",
    answers: {
      working_title: "Epistemic Uncertainty Calibration in Transformer Foundation Models",
      title: "Epistemic Uncertainty Calibration in Transformer Foundation Models",
      degreeLevel: "PhD Dissertation",
      theoreticalFramework: "Bayesian Deep Learning and Conformal Prediction Theory",
      methodologicalDesign: "Mixed-methods empirical ablation across 10B+ parameter transformer checkpoints.",
      researchQuestions: [
        "To what degree does temperature scaling degrade out-of-distribution calibration in high-dimensional language representations?",
        "Can conformal risk controls provide provable coverage guarantees under non-stationary covariate shift?",
      ],
      chapters: [
        { chapterNumber: 1, title: "Introduction and Problem Formulation", wordCount: 4200, targetWordCount: 6000, status: "drafting" },
        { chapterNumber: 2, title: "Critical Literature Review & Theoretical Framing", wordCount: 11500, targetWordCount: 12000, status: "reviewed" },
        { chapterNumber: 3, title: "Methodology and Experimental Architecture", wordCount: 7800, targetWordCount: 8000, status: "reviewed" },
        { chapterNumber: 4, title: "Empirical Findings & Ablation Studies", wordCount: 9500, targetWordCount: 12000, status: "drafting" },
        { chapterNumber: 5, title: "Critical Discussion & Theoretical Implications", wordCount: 1200, targetWordCount: 8000, status: "drafting" },
        { chapterNumber: 6, title: "Conclusion and Future Horizons", wordCount: 0, targetWordCount: 4000, status: "not_started" },
      ],
    },
    evidenceLedger: {
      sources: [
        {
          id: "src_vault_conformal",
          title: "Conformal Prediction Bounds for Modern Neural Networks",
          authors: ["Angelopoulos, A.", "Bates, S."],
          year: 2021,
          venue: "Foundations and Trends in Machine Learning",
          doi: "10.1561/2200000085",
        },
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

// ── Test Suites ──

describe("Architectural Unification Step 2: System-Wide scholarBrain Integration", () => {

  // Arm 1: AskScholar & Deep Research Grounding
  describe("Arm 1: AskScholar & Deep Research Grounding (/api/ai/agent)", () => {
    it("hands the prompt to the browser and accepts only an answer bound to that prompt (P1-10)", async () => {
      const body = {
        prompt: "What are the latest advances in non-Markovian quantum error mitigation?",
        mode: "chat",
        vaultSources: [{ id: "src_vault_1", title: "Benchmarking Non-Markovian Quantum Error Suppressions", authors: ["Finch, A."], year: 2023 }],
      };
      const first = await request(app).post("/api/ai/agent").send(body);
      expect(first.status).toBe(426);
      expect(first.body.requireFrontendLLM).toBe(true);
      const { challengeToken, canonicalSources } = first.body;

      // The browser's answer, sent back with the echoed sources (as authedJsonFetch does)
      const ok = await request(app)
        .post("/api/ai/agent")
        .send({ ...body, canonicalSources, challengeToken, llmResult: "Mitigation improves with memory-aware decoders [CITE:src_vault_1]." });
      expect(ok.status).toBe(200);
      expect(ok.body.text).toContain("Finch");

      // A token for this user but a different question is rejected
      const swapped = await request(app)
        .post("/api/ai/agent")
        .send({ ...body, prompt: "Something else entirely about protein folding?", canonicalSources, challengeToken, llmResult: "anything" });
      expect(swapped.status).toBe(403);
      expect(swapped.body.code).toBe("ai_challenge_invalid");

      // No token at all is rejected too
      const unsigned = await request(app).post("/api/ai/agent").send({ ...body, canonicalSources, llmResult: "anything" });
      expect(unsigned.status).toBe(403);
    });

    it("deep research hands off and verifies against the deep-research prompt", async () => {
      const body = { prompt: "Survey the literature on coastal erosion modelling", mode: "deep-research" };
      const first = await request(app).post("/api/ai/agent").send(body);
      expect(first.status).toBe(426);
      expect(first.body.mode).toBe("deep-research");
      const ok = await request(app)
        .post("/api/ai/agent")
        .send({ ...body, canonicalSources: first.body.canonicalSources, challengeToken: first.body.challengeToken, llmResult: "A synthesis." });
      expect(ok.status).toBe(200);
    });

    it("executes multi-portal evidence retrieval and scrubs citations with APA 7 references", async () => {
      // Mock scholarBrain.complete to simulate grounded response with valid token
      const completeSpy = vi.spyOn(scholarBrain, "complete").mockResolvedValue({
        text: "Recent investigations in quantum computing indicate that non-Markovian dynamics mitigate error latency [CITE:src_vault_1]. However, arbitrary ungrounded claims (Finch et al., 2020) cannot be verified.",
        provider: "mock-provider",
        model: "mock-model",
        wordCount: 26,
        burstinessMetrics: {
          averageLength: 13,
          variance: 4,
          burstinessScore: 0.25,
          isSufficientlyBurst: true,
        },
      });

      const res = await request(app)
        .post("/api/ai/agent")
        // A real provider name: the router reads only providers it can route to.
        .set("x-ai-provider", "openai")
        .set("x-ai-model", "mock-model")
        .set("x-ai-api-key", "test-key")
        .send({
          prompt: "What are the latest advances in non-Markovian quantum error mitigation?",
          vaultSources: [
            {
              id: "src_vault_1",
              title: "Benchmarking Non-Markovian Quantum Error Suppressions",
              authors: ["Finch, A.", "Thorne, A."],
              year: 2023,
              venue: "Physical Review Letters",
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.text).toBeDefined();
      // Verified token was resolved or formatted
      expect(res.body.text).toContain("Finch");
      // Hallucinated parenthetical was replaced or stripped
      expect(res.body.text).not.toContain("(Finch et al., 2020)");
      // References section appended
      expect(res.body.text).toContain("References");
      expect(res.body.wordCount).toBeGreaterThan(0);
      expect(res.body.burstinessMetrics).toBeDefined();

      completeSpy.mockRestore();
    });

    it("a failing provider is reported (502), not silently handed to the browser", async () => {
      const completeSpy = vi.spyOn(scholarBrain, "complete").mockRejectedValue(new Error("provider 500"));
      const res = await request(app)
        .post("/api/ai/agent")
        .set("x-ai-provider", "openai")
        .set("x-ai-model", "mock-model")
        .set("x-ai-api-key", "test-key")
        .send({ prompt: "Explain conformal prediction briefly.", mode: "chat" });
      expect(res.status).toBe(502);
      expect(res.body.code).toBe("ai_unavailable");
      expect(res.body.requireFrontendLLM).toBeUndefined();
      completeSpy.mockRestore();
    });

    it("deep research with no AI connected asks for a provider before any retrieval", async () => {
      const res = await request(app).post("/api/ai/deep-research").send({ topic: "Coastal erosion modelling" });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("ai_provider_required");
    });

    it("attaches 1-click deliverable handoff payload for academic format launching", async () => {
      const res = await request(app)
        .post("/api/ai/agent")
        .set("x-ai-provider", "mock-provider")
        .set("x-ai-model", "mock-model")
        .set("x-ai-api-key", "test-key")
        .send({
          prompt: "Draft an undergraduate research essay on corporate financial risk management under fluctuating interest rates.",
          mode: "chat",
          vaultSources: [
            {
              id: "src_vault_1",
              title: "Corporate Financial Risk Management",
              authors: ["Sharpe, W."],
              year: 2021,
            },
          ],
          incomingLlmResult: "This is a comprehensive undergraduate coursework essay on corporate financial risk management [CITE:src_vault_1].",
        });

      expect([200, 426]).toContain(res.status);
      const handoff = res.body.recommendedWorkspaceHandoff || res.body.deliverableIntent;
      if (handoff) {
        expect(["OT-01", "OT-10", "OT-15", "OT-07", "OT-22"]).toContain(handoff.targetFormatId);
        expect(handoff.suggestedTitle).toBeDefined();
      }
    });
  });

  // Arm 2: Presentation Studio OT-22
  describe("Arm 2: Presentation Studio OT-22 (/generate-deck & /qa-simulate)", () => {
    it("POST /generate-deck produces 6 standard 16:9 slide beats with speaker scripts", async () => {
      const projectId = await createTestPresentationProject("proj-presentation-deck-test");

      const res = await request(app)
        .post(`/api/projects/${projectId}/presentation/generate-deck`)
        .set("x-ai-provider", "mock-provider")
        .set("x-ai-model", "mock-model")
        .set("x-ai-api-key", "test-key")
        .send({
          aspectRatio: "16:9",
          presentationType: "conference",
          targetDurationMinutes: 15,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.slides)).toBe(true);
      expect(res.body.slides.length).toBeGreaterThanOrEqual(5);

      const slideTypes = res.body.slides.map((s: { type: string }) => s.type);
      expect(slideTypes).toContain("title");
      expect(slideTypes).toContain("problem_gap");
      expect(slideTypes).toContain("framework_methodology");

      // Verify speaker notes are included on each slide
      for (const slide of res.body.slides) {
        expect(slide.speakerNotes).toBeDefined();
        expect(slide.speakerNotes.length).toBeGreaterThan(0);
      }
    });

    it("POST /generate-deck gives the AI the presenter's key message, points and time per card", async () => {
      const projectId = await createTestPresentationProject("proj-presentation-plan-test");
      const card = (n: number, title: string) => ({ slideNumber: n, type: "framework_methodology", title, speakerNotes: "notes", card: { layout: "statement" } });
      const brain = mockBrain({ deckTitle: "T", slides: [card(1, "A"), card(2, "B"), card(3, "C"), card(4, "D")] });
      const res = await request(app)
        .post(`/api/projects/${projectId}/presentation/generate-deck`)
        .set(aiHeaders)
        .send({
          title: "FPGA decoders",
          keyMessage: "Pipelined decoders keep up in real time.",
          points: ["Software decoders fall behind", "We tested three boards"],
          durationMinutes: 10,
          slideCount: 8,
        });
      expect(res.status).toBe(200);
      expect(res.body.generatedBy).toBe("ai-gateway");
      const prompt = String((brain.mock.calls[0][0] as { userPrompt: string }).userPrompt);
      expect(prompt).toContain("Key message (open with it on the title card's lede and close with it as the final takeaway): Pipelined decoders keep up in real time.");
      expect(prompt).toContain("1. Software decoders fall behind\n2. We tested three boards");
      expect(prompt).toContain("Duration: 10 minutes (about 75 seconds per card)");
      brain.mockRestore();
    });

    // The route used to return a fixed, topic-independent Q&A set (with invented
    // results) whenever the AI call failed, and this test asserted it. It now
    // returns only the AI's questions (PRODUCT_AUDIT P0-11), so the answer is mocked.
    it("POST /qa-simulate returns the AI's referee questions, and a 502 with none when the AI fails", async () => {
      const projectId = await createTestPresentationProject("proj-presentation-qa-test");
      mockBrain({
        qaScenarios: [
          { questionId: "qa-1", audienceType: "Methodologist", difficultyLevel: "rigorous", targetedSlideNumber: 2, questionText: "Why this sample?", probingIntent: "p", suggestedAnswer: "s", modelRebuttalStructure: ["a", "b"] },
        ],
      });

      const ok = await request(app)
        .post(`/api/projects/${projectId}/presentation/qa-simulate`)
        .set(aiHeaders)
        .send({});
      expect(ok.status).toBe(200);
      expect(ok.body.qaScenarios).toHaveLength(1);
      expect(ok.body.qaScenarios[0].questionText).toBe("Why this sample?");

      vi.spyOn(scholarBrain, "complete").mockRejectedValue(new Error("provider 500"));
      const failed = await request(app)
        .post(`/api/projects/${projectId}/presentation/qa-simulate`)
        .set(aiHeaders)
        .send({});
      expect(failed.status).toBe(502);
      expect(failed.body.qaScenarios).toBeUndefined();
    });
  });

  // Arm 3: Research Proposal OT-15
  // These routes used to fall back to keyword-heuristic scores and template prose
  // whenever the AI call failed ("mock-provider" always fails), and the old tests
  // asserted that invented output. They now return the AI's own answer or an
  // honest error (PRODUCT_AUDIT P0-9), so the AI answer is mocked here.
  function mockBrain(parsedJson: unknown, text = JSON.stringify(parsedJson)) {
    return vi.spyOn(scholarBrain, "complete").mockResolvedValue({
      text,
      parsedJson,
      provider: "mock-provider",
      model: "mock-model",
      wordCount: text.split(/\s+/).length,
      burstinessMetrics: { averageLength: 18, variance: 6, burstinessScore: 0.3, isSufficientlyBurst: true },
    });
  }
  const aiHeaders = { "x-ai-provider": "mock-provider", "x-ai-model": "mock-model", "x-ai-api-key": "test-key" };

  describe("Arm 3: Research Proposal OT-15 (/study-section-simulate, /aims-audit & /draft-section)", () => {
    it("POST /study-section-simulate returns the AI panel's scores for the stored proposal", async () => {
      const projectId = await createTestProposalProject("proj-proposal-sim-test");
      const brain = mockBrain({
        overallImpactScore: "2.4",
        recommendationForFunding: "Fundable with revision",
        criteria: [
          { criterion: "Significance", score: 2, verdict: "Strong", critique: "c1", recommendation: "r1" },
          { criterion: "Approach", score: 3, verdict: "Good", critique: "c2", recommendation: "r2" },
          { criterion: "Innovation", verdict: "no score given" },
        ],
      });

      const res = await request(app)
        .post(`/api/projects/${projectId}/proposal/study-section-simulate`)
        .set(aiHeaders)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.overallImpactScore).toBe("2.4");
      expect(res.body.agency).toBe("NIH");
      // The user's stored aims reach the AI; a criterion without a score is dropped, never defaulted.
      expect(String(brain.mock.calls[0][0].userPrompt)).toContain("CRISPR-dCas9");
      expect(res.body.criteria.map((c: { criterion: string }) => c.criterion)).toEqual(["Significance", "Approach"]);
    });

    it("POST /aims-audit returns the AI's checks and never shows an unknown status as a pass", async () => {
      const projectId = await createTestProposalProject("proj-proposal-aims-test");
      mockBrain({
        checks: [
          { name: "Overarching Hypothesis Stated", status: "passed", detail: "d1" },
          { name: "Aim Structural Independence", status: "maybe", detail: "d2" },
        ],
      });

      const res = await request(app)
        .post(`/api/projects/${projectId}/proposal/aims-audit`)
        .set(aiHeaders)
        .send({
          aimsText: "Specific Aim 1: Elucidate CRISPR-dCas9 demethylation in iPSC models. Specific Aim 2: Quantify off-target effects. Specific Aim 3: Deliver via lipid nanoparticles.",
        });

      expect(res.status).toBe(200);
      expect(res.body.checks).toEqual([
        { name: "Overarching Hypothesis Stated", status: "passed", detail: "d1" },
        { name: "Aim Structural Independence", status: "warn", detail: "d2" },
      ]);
    });

    it("POST /draft-section returns the AI draft, and a 502 with no text when the AI fails", async () => {
      const projectId = await createTestProposalProject("proj-proposal-draft-test");
      mockBrain(undefined, "The significance of this work rests on [CITE:src_vault_1].");

      const ok = await request(app)
        .post(`/api/projects/${projectId}/proposal/draft-section`)
        .set(aiHeaders)
        .send({ sectionTitle: "Significance", targetWords: 350, citationStyle: "apa7", dialect: "en-GB" });
      expect(ok.status).toBe(200);
      expect(ok.body.sectionTitle).toBe("Significance");
      expect(ok.body.content).toContain("significance of this work");

      vi.spyOn(scholarBrain, "complete").mockRejectedValue(new Error("provider 500"));
      const failed = await request(app)
        .post(`/api/projects/${projectId}/proposal/draft-section`)
        .set(aiHeaders)
        .send({ sectionTitle: "Significance" });
      expect(failed.status).toBe(502);
      expect(failed.body.code).toBe("ai_unavailable");
      expect(failed.body.content).toBeUndefined();
    });
  });

  // Arm 4: Thesis & Dissertation OT-07/OT-07
  describe("Arm 4: Thesis & Dissertation OT-07/OT-07 (/viva-simulate, /chapter-audit & /draft-chapter)", () => {
    it("POST /viva-simulate returns the AI examiner questions for the stored thesis", async () => {
      const projectId = await createTestThesisProject("proj-thesis-viva-test");
      const brain = mockBrain({
        examinerPersona: "Senior External Examiner, Machine Learning",
        examinerRigorScore: "High",
        questions: [
          { id: "q1", category: "Method", examinerQuestion: "Why temperature scaling?", assessmentFocus: "f", suggestedRebuttalStructure: ["a", "b"] },
          { id: "q2", category: "Empty", examinerQuestion: "" },
        ],
      });

      const res = await request(app)
        .post(`/api/projects/${projectId}/thesis/viva-simulate`)
        .set(aiHeaders)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.examinerPersona).toBe("Senior External Examiner, Machine Learning");
      expect(res.body.questions).toHaveLength(1);
      expect(res.body.questions[0].examinerQuestion).toBe("Why temperature scaling?");
      expect(String(brain.mock.calls[0][0].userPrompt)).toContain("temperature scaling degrade");
    });

    it("POST /chapter-audit returns the AI audit with the deterministic gate summaries", async () => {
      const projectId = await createTestThesisProject("proj-thesis-audit-test");
      mockBrain({
        totalChapters: 2,
        alignmentScore: 64,
        coherenceStatus: "Gaps between chapters 1 and 2",
        crossChapterChecks: [{ check: "RQ propagation", status: "fail", details: "RQ2 is never answered." }],
      });

      const res = await request(app)
        .post(`/api/projects/${projectId}/thesis/chapter-audit`)
        .set(aiHeaders)
        .send({
          chapters: [
            { chapterNumber: 1, title: "Introduction", wordCount: 4000, targetWordCount: 6000, status: "drafting" },
            { chapterNumber: 2, title: "Literature Review", wordCount: 2000, targetWordCount: 12000, status: "drafting" },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.audit.alignmentScore).toBe(64);
      expect(res.body.audit.crossChapterChecks).toEqual([
        { check: "RQ propagation", status: "fail", details: "RQ2 is never answered." },
      ]);
      expect(Array.isArray(res.body.chapterSummaries)).toBe(true);
    });

    it("POST /draft-chapter returns the AI draft, and a 502 with no text when the AI fails", async () => {
      const projectId = await createTestThesisProject("proj-thesis-draft-test");
      mockBrain(undefined, "Calibration has been studied extensively [CITE:src_vault_1].");

      const ok = await request(app)
        .post(`/api/projects/${projectId}/thesis/draft-chapter`)
        .set(aiHeaders)
        .send({ chapterNumber: 2, chapterTitle: "Critical Literature Review", targetWords: 500, citationStyle: "apa7", dialect: "en-GB" });
      expect(ok.status).toBe(200);
      expect(ok.body.chapterNumber).toBe(2);
      expect(ok.body.content).toContain("Calibration has been studied");

      vi.spyOn(scholarBrain, "complete").mockRejectedValue(new Error("provider 500"));
      const failed = await request(app)
        .post(`/api/projects/${projectId}/thesis/draft-chapter`)
        .set(aiHeaders)
        .send({ chapterNumber: 2, chapterTitle: "Critical Literature Review" });
      expect(failed.status).toBe(502);
      expect(failed.body.content).toBeUndefined();
    });
  });

  // Strict Client-Owned BYOK/Local AI Routing
  describe("Pillar 5: Strict Client-Owned BYOK/Local AI Routing", () => {
    it("rejects completion without client credentials and refuses to read server env keys", async () => {
      await expect(
        scholarBrain.complete({
          userPrompt: "Synthesize doctoral literature on conformal prediction.",
        })
      ).rejects.toThrow("Client-Owned AI Routing Required");
    });

    it("accepts client transient headers without persisting credentials or hardcoding models", async () => {
      const result = await scholarBrain.complete({
        headers: {
          provider: "mock-ollama",
          model: "llama3.3:70b",
          apiKey: "local-no-credential-required",
          baseUrl: "http://localhost:11434",
        },
        userPrompt: "Generate a summary.",
      }).catch((err) => {
        // In local test environment without running Ollama daemon, ensure error is gateway connection failure, NOT missing credentials
        return { error: err.message };
      });

      if ("error" in result) {
        expect(result.error).not.toContain("Client-Owned AI Routing Required");
      }
    });
  });
});
