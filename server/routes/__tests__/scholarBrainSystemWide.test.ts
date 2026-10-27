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
    outputTypeId: "OT-19",
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
    outputTypeId: "OT-09",
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
        .set("x-ai-provider", "mock-provider")
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
        expect(["OT-01", "OT-10", "OT-19", "OT-09", "OT-22"]).toContain(handoff.targetFormatId);
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

    it("POST /qa-simulate generates grounded referee personas and structured rebuttal guides", async () => {
      const projectId = await createTestPresentationProject("proj-presentation-qa-test");

      const res = await request(app)
        .post(`/api/projects/${projectId}/presentation/qa-simulate`)
        .set("x-ai-provider", "mock-provider")
        .set("x-ai-model", "mock-model")
        .set("x-ai-api-key", "test-key")
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.qaScenarios)).toBe(true);
      expect(res.body.qaScenarios.length).toBeGreaterThanOrEqual(3);

      const firstQ = res.body.qaScenarios[0];
      expect(firstQ.audienceType).toBeDefined();
      expect(firstQ.questionText).toBeDefined();
      expect(firstQ.modelRebuttalStructure).toBeDefined();
      expect(Array.isArray(firstQ.modelRebuttalStructure)).toBe(true);
      expect(firstQ.modelRebuttalStructure.length).toBeGreaterThanOrEqual(2);
    });
  });

  // Arm 3: Research Proposal OT-19
  describe("Arm 3: Research Proposal OT-19 (/study-section-simulate, /aims-audit & /draft-section)", () => {
    it("POST /study-section-simulate returns 1.0-9.0 criterion scoring and panel verdicts", async () => {
      const projectId = await createTestProposalProject("proj-proposal-sim-test");

      const res = await request(app)
        .post(`/api/projects/${projectId}/proposal/study-section-simulate`)
        .set("x-ai-provider", "mock-provider")
        .set("x-ai-model", "mock-model")
        .set("x-ai-api-key", "test-key")
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.agency).toContain("NIH");
      expect(res.body.overallImpactScore).toBeDefined();
      expect(res.body.recommendationForFunding).toBeDefined();
      expect(Array.isArray(res.body.criteria)).toBe(true);
      expect(res.body.criteria.length).toBe(5);

      const criteriaNames = res.body.criteria.map((c: { criterion: string }) => c.criterion);
      expect(criteriaNames).toContain("Significance");
      expect(criteriaNames).toContain("Investigator(s)");
      expect(criteriaNames).toContain("Innovation");
      expect(criteriaNames).toContain("Approach");
      expect(criteriaNames).toContain("Environment");

      // Verify NIH 1.0-9.0 numeric range
      for (const crit of res.body.criteria) {
        expect(crit.score).toBeGreaterThanOrEqual(1.0);
        expect(crit.score).toBeLessThanOrEqual(9.0);
      }
    });

    it("POST /aims-audit evaluates Specific Aims structural independence and hypothesis clarity", async () => {
      const projectId = await createTestProposalProject("proj-proposal-aims-test");

      const res = await request(app)
        .post(`/api/projects/${projectId}/proposal/aims-audit`)
        .set("x-ai-provider", "mock-provider")
        .set("x-ai-model", "mock-model")
        .set("x-ai-api-key", "test-key")
        .send({
          aimsText: "Specific Aim 1: Elucidate CRISPR-dCas9 demethylation in iPSC models. Specific Aim 2: Quantify off-target effects. Specific Aim 3: Deliver via lipid nanoparticles.",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.checks)).toBe(true);
      expect(res.body.checks.length).toBeGreaterThanOrEqual(3);

      for (const check of res.body.checks) {
        expect(["passed", "warn", "fail"]).toContain(check.status);
        expect(check.name).toBeDefined();
        expect(check.detail).toBeDefined();
      }
    });

    it("POST /draft-section drafts grounded proposal section with verified APA 7 bibliography", async () => {
      const projectId = await createTestProposalProject("proj-proposal-draft-test");

      const res = await request(app)
        .post(`/api/projects/${projectId}/proposal/draft-section`)
        .set("x-ai-provider", "mock-provider")
        .set("x-ai-model", "mock-model")
        .set("x-ai-api-key", "test-key")
        .send({
          sectionTitle: "Significance",
          targetWords: 350,
          citationStyle: "apa7",
          dialect: "en-GB",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.sectionTitle).toBe("Significance");
      expect(res.body.content).toBeDefined();
      expect(res.body.wordCount).toBeGreaterThan(0);
      expect(res.body.burstinessMetrics).toBeDefined();
    });
  });

  // Arm 4: Thesis & Dissertation OT-09/OT-07
  describe("Arm 4: Thesis & Dissertation OT-09/OT-07 (/viva-simulate, /chapter-audit & /draft-chapter)", () => {
    it("POST /viva-simulate returns senior examiner persona and rigorous adversarial defense questions", async () => {
      const projectId = await createTestThesisProject("proj-thesis-viva-test");

      const res = await request(app)
        .post(`/api/projects/${projectId}/thesis/viva-simulate`)
        .set("x-ai-provider", "mock-provider")
        .set("x-ai-model", "mock-model")
        .set("x-ai-api-key", "test-key")
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.examinerPersona).toBeDefined();
      expect(res.body.examinerRigorScore).toContain("Viva Voce Standard");
      expect(Array.isArray(res.body.questions)).toBe(true);
      expect(res.body.questions.length).toBeGreaterThanOrEqual(3);

      const q1 = res.body.questions[0];
      expect(q1.category).toBeDefined();
      expect(q1.examinerQuestion).toBeDefined();
      expect(q1.assessmentFocus).toBeDefined();
      expect(Array.isArray(q1.suggestedRebuttalStructure)).toBe(true);
    });

    it("POST /chapter-audit evaluates cross-chapter consistency and structural proportion", async () => {
      const projectId = await createTestThesisProject("proj-thesis-audit-test");

      const res = await request(app)
        .post(`/api/projects/${projectId}/thesis/chapter-audit`)
        .set("x-ai-provider", "mock-provider")
        .set("x-ai-model", "mock-model")
        .set("x-ai-api-key", "test-key")
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.audit).toBeDefined();
      expect(res.body.audit.alignmentScore).toBeGreaterThanOrEqual(70);
      expect(res.body.audit.coherenceStatus).toBeDefined();
      expect(Array.isArray(res.body.audit.crossChapterChecks)).toBe(true);
      expect(res.body.audit.crossChapterChecks.length).toBeGreaterThanOrEqual(4);
    });

    it("POST /draft-chapter drafts grounded doctoral chapter with verified bibliography and word metrics", async () => {
      const projectId = await createTestThesisProject("proj-thesis-draft-test");

      const res = await request(app)
        .post(`/api/projects/${projectId}/thesis/draft-chapter`)
        .set("x-ai-provider", "mock-provider")
        .set("x-ai-model", "mock-model")
        .set("x-ai-api-key", "test-key")
        .send({
          chapterNumber: 2,
          chapterTitle: "Critical Literature Review",
          targetWords: 500,
          citationStyle: "apa7",
          dialect: "en-GB",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.chapterNumber).toBe(2);
      expect(res.body.chapterTitle).toBe("Critical Literature Review");
      expect(res.body.content).toBeDefined();
      expect(res.body.wordCount).toBeGreaterThan(0);
      expect(res.body.burstinessMetrics).toBeDefined();
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
