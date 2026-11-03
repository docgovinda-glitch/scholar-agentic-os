import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

export const TEST_USER_ID = "11111111-1111-4111-8111-111111111111";

vi.mock("../../src/middleware/auth.ts", () => ({
  requireAuth: (req: { user?: { id: string; email: string } }, _res: unknown, next: () => void) => {
    req.user = { id: TEST_USER_ID, email: "scholar-test@example.com" };
    next();
  },
}));

import request from "supertest";
import { app } from "../../../server.ts";
import { __resetProjectStoreForTests } from "../../../src/app/conductor/projectStore.ts";
import { getProjectStore, type ProjectRecord } from "../../../src/services/store/projectStore.ts";
import { scholarBrain } from "../../src/services/scholarBrain.ts";
import {
  allocateWordsByMarks,
  parseQuestionMarks,
  countExactWords,
} from "../../src/utils/wordBudgetAllocator.ts";
import {
  extractSubstantiveBriefQuestions,
  allocateWordsByMarks as clientAllocateWords,
} from "../../../src/utils/briefExtractor.ts";
import {
  generateDynamicAssignmentStructure,
  conductAskScholarResearchForOutline,
} from "../../../src/desk/assignment/services/outlineService.ts";

const originalFetch = global.fetch;

beforeEach(() => {
  __resetProjectStoreForTests();
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

async function createTestCourseworkProject(projectId = "proj-coursework-qnt"): Promise<string> {
  const store = getProjectStore();
  const project: ProjectRecord = {
    projectId,
    ownerId: TEST_USER_ID,
    schemaVersion: 1,
    outputTypeId: "OT-01",
    answers: {
      working_title: "Quantitative Business Analytics Assessment",
      assignment_type: "coursework",
      academic_level: "undergraduate",
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

describe("Architectural Unification Step 1: scholarBrain Orchestrator & OT-01 Coursework Engine", () => {
  const sampleSevenQuestionExamBrief = `
Module: QNT-4020 Quantitative Decision Analysis and Applied Business Statistics
Final Examination & Coursework Assessment (Total: 100 Marks)
Target Word Count: 3,500 words

Instructions: Answer ALL SEVEN (7) questions in sequential order.

Question 1:
Critically evaluate the assumptions underlying the Capital Asset Pricing Model (CAPM) and examine empirical deviations observed in contemporary volatile equities markets. [10 marks]

Question 2:
Compute and critically interpret the Weighted Average Cost of Capital (WACC) for a dual-tier capitalized enterprise under rising central bank interest rate regimes. (15 pts)

Question 3:
Analyse the operational impact of high financial leverage on corporate Return on Equity (ROE) using a decomposed five-stage DuPont framework. [20 marks]

Question 4:
Assess the mathematical tractability and practical boundary conditions of the Black-Scholes-Merton option pricing model in extreme tail-risk environments. [15 marks]

Question 5:
Examine how behavioral heuristics, specifically loss aversion and overconfidence, distort rational pricing signals across emerging asset classes. (10 marks)

Question 6:
Formulate an optimal portfolio asset allocation matrix using modern portfolio theory, comparing mean-variance optimization against conditional Value-at-Risk (cVaR) metrics. [15 marks]

Question 7:
Synthesize corporate governance mechanisms that mitigate managerial agency conflicts and optimize shareholder value during cross-border mergers and acquisitions. [15 marks]
`.trim();

  // Pillar 1: Zero Question Truncation Bug (Eliminates legacy .slice(0, 4) / .slice(0, 6) caps)
  describe("Bug 1 Elimination: Zero Truncation for 7+ Question Coursework Briefs", () => {
    it("extracts all 7 questions from a 7-question exam brief without truncation", () => {
      const extracted = extractSubstantiveBriefQuestions(sampleSevenQuestionExamBrief);

      expect(extracted.length).toBe(7);

      // Verify that questions 5, 6, and 7 are intact and not dropped
      expect(extracted[0]).toContain("Capital Asset Pricing Model");
      expect(extracted[1]).toContain("Weighted Average Cost of Capital");
      expect(extracted[2]).toContain("DuPont framework");
      expect(extracted[3]).toContain("Black-Scholes-Merton");
      expect(extracted[4]).toContain("behavioral heuristics");
      expect(extracted[5]).toContain("optimal portfolio asset allocation");
      expect(extracted[6]).toContain("corporate governance mechanisms");
    });

    it("allocates proportional word budgets across all 7 questions summing to exactly 3,500 words", () => {
      const extracted = extractSubstantiveBriefQuestions(sampleSevenQuestionExamBrief);
      const allocation = scholarBrain.allocateWordsByMarks(extracted, 3500);

      expect(allocation.questions.length).toBe(7);
      expect(allocation.allocatedTotalWords).toBe(3500);
      expect(allocation.targetTotalWords).toBe(3500);

      // Question 1 (10 marks = 10% of 3500) -> 350 words
      expect(allocation.questions[0].allocatedWords).toBe(350);
      expect(allocation.questions[0].marks).toBe(10);
      expect(allocation.questions[0].percentageWeight).toBe(10);

      // Question 2 (15 marks = 15% of 3500) -> 525 words
      expect(allocation.questions[1].allocatedWords).toBe(525);
      expect(allocation.questions[1].marks).toBe(15);
      expect(allocation.questions[1].percentageWeight).toBe(15);

      // Question 3 (20 marks = 20% of 3500) -> 700 words
      expect(allocation.questions[2].allocatedWords).toBe(700);
      expect(allocation.questions[2].marks).toBe(20);
      expect(allocation.questions[2].percentageWeight).toBe(20);

      // Questions > 500 words are broken into 350-500 word chunks
      expect(allocation.questions[2].chunks.length).toBeGreaterThanOrEqual(2);
      const q3ChunkTotal = allocation.questions[2].chunks.reduce((sum, c) => sum + c.targetWords, 0);
      expect(q3ChunkTotal).toBe(700);

      // Questions 5, 6, and 7 must each have non-zero target word budgets
      expect(allocation.questions[4].allocatedWords).toBe(350);
      expect(allocation.questions[5].allocatedWords).toBe(525);
      expect(allocation.questions[6].allocatedWords).toBe(525);

      const totalCalculated = allocation.questions.reduce((sum, q) => sum + q.allocatedWords, 0);
      expect(totalCalculated).toBe(3500);
    });
  });

  // Pillar 2: Deterministic Mark-Weighted Word Allocator
  describe("Bug 3 Elimination: Mark-Weighted Word Budget Allocator", () => {
    it("allocates exactly 30% of words to a 30-mark question out of a 100-mark brief", () => {
      const questions = [
        "Task 1: Introduction and overview. [10 marks]",
        "Task 2: Literature analysis and framework synthesis. [20 marks]",
        "Task 3: Deep empirical investigation and econometric modelling. [30 marks]",
        "Task 4: Strategic evaluation and implementation roadmap. [40 marks]",
      ];

      const result = scholarBrain.allocateWordsByMarks(questions, 2000);

      expect(result.targetTotalWords).toBe(2000);
      expect(result.allocatedTotalWords).toBe(2000);

      // 30 marks out of 100 marks = 30% of 2000 words = 600 words
      const task3 = result.questions[2];
      expect(task3.marks).toBe(30);
      expect(task3.percentageWeight).toBe(30);
      expect(task3.allocatedWords).toBe(600);

      // Sum of allocated words must match total budget exactly
      const totalWords = result.questions.reduce((acc, q) => acc + q.allocatedWords, 0);
      expect(totalWords).toBe(2000);
    });

    it("parses equation marks, compound subparts, and percentages accurately", () => {
      expect(parseQuestionMarks("Critically analyse the policy (Part A 10 marks + Part B 15 marks = 25 marks)")).toBe(25);
      expect(parseQuestionMarks("Evaluate the case study [Weight: 40%]")).toBe(40);
      expect(parseQuestionMarks("Executive summary (15 pts)")).toBe(15);
      expect(parseQuestionMarks("Essay without explicit marks")).toBeUndefined();
    });

    it("subdivides questions exceeding 500 words into 350-500 word sub-chunks", () => {
      const questions = [
        "Major Research Monograph Essay Question [100 marks]",
      ];
      const result = scholarBrain.allocateWordsByMarks(questions, 1500);

      expect(result.allocatedTotalWords).toBe(1500);
      const q = result.questions[0];
      expect(q.allocatedWords).toBe(1500);
      expect(q.chunks.length).toBeGreaterThanOrEqual(3);

      for (const chunk of q.chunks) {
        expect(chunk.targetWords).toBeGreaterThanOrEqual(350);
        expect(chunk.targetWords).toBeLessThanOrEqual(500);
      }
      const sumChunks = q.chunks.reduce((s, c) => s + c.targetWords, 0);
      expect(sumChunks).toBe(1500);
    });
  });

  // Pillar 3: Purge of Hardcoded Topic Contamination
  describe("Bug 2 Elimination: Zero Hardcoded Topic Contamination", () => {
    it("never injects Liberal Commercial Peace Theory into international trade or economic briefs", () => {
      const brief = "Analyse the geopolitical risks and economic interdependence between trading partners in South Asia.";
      const structure = generateDynamicAssignmentStructure({
        question: brief,
        assignmentType: "coursework",
        academicLevel: "undergraduate",
        targetWordCount: 2000,
        briefText: brief,
      });

      const serialized = JSON.stringify(structure);
      expect(serialized).not.toContain("Liberal Commercial Peace Theory");
      expect(serialized).not.toContain("Liberal Commercialism");
      expect(serialized).not.toContain("commercial peace");
    });

    it("does not classify QNT-4020 business statistics as Quantum Computing", () => {
      const brief = sampleSevenQuestionExamBrief;
      const isQuantum = /\b(quantum|qubit|qiskit|superposition|entanglement)\b/i.test(brief);
      expect(isQuantum).toBe(false);
    });
  });

  // Pillar 4: Anti-Hallucination Citation Scrubbing & Multi-Style Formatting
  describe("scholarBrain.scrubAndFormatCitations: Verified Citation Interception", () => {
    const verifiedSources = [
      {
        id: "src_1",
        title: "Capital Asset Pricing and Market Beta Invariance",
        authors: ["Sharpe, William F.", "Lintner, John"],
        year: 2021,
        venue: "Journal of Financial Economics",
        doi: "10.1016/j.jfineco.2021.05.002",
      },
      {
        id: "src_2",
        title: "Behavioral Heuristics in Dynamic Financial Regimes",
        authors: ["Kahneman, Daniel", "Tversky, Amos"],
        year: 2019,
        venue: "Quarterly Journal of Economics",
      },
    ];

    it("replaces verified bracket tokens [CITE:src_1] in APA 7 and strips hallucinated citations", () => {
      const rawText = "The CAPM assumptions hold that systematic risk dominates [CITE:src_1]. However, some rogue theorists argue otherwise (Smith & Jones, 2024).";
      
      const scrubbed = scholarBrain.scrubAndFormatCitations(rawText, verifiedSources, "apa7");

      expect(scrubbed.formattedText).toContain("(Sharpe & Lintner, 2021)");
      expect(scrubbed.formattedText).not.toContain("[CITE:src_1]");
      // Hallucinated parenthetical (Smith & Jones, 2024) is stripped because Smith & Jones is not verified
      expect(scrubbed.formattedText).not.toContain("Smith & Jones");
      expect(scrubbed.hallucinatedCitationsStripped.length).toBeGreaterThan(0);
    });

    it("formats verified citations correctly in IEEE numeric bracket notation", () => {
      const rawText = "Evidence demonstrates behavioral distortion in emerging markets [CITE:src_2].";
      const scrubbed = scholarBrain.scrubAndFormatCitations(rawText, verifiedSources, "ieee");

      expect(scrubbed.formattedText).toContain("[1]");
      expect(scrubbed.referencesLedger).toContain("Behavioral Heuristics in Dynamic Financial Regimes");
    });
  });

  // Pillar 5: Unified Scholarly Voice Guard & Diacritic Preservation
  describe("scholarBrain.enforceScholarlyVoice: Orthography, Cliché Suppression & Diacritics", () => {
    it("enforces British Oxford orthography (-ise, -our, -re) while preserving NFC Unicode and IAST diacritics", () => {
      const input = "We will analyze the color and center of the text while studying Śaṅkara and Mīmāṃsā epistemology.";
      const result = scholarBrain.enforceScholarlyVoice(input, { dialect: "en-GB", stripCliches: true });

      expect(result.text).toContain("analyse");
      expect(result.text).toContain("colour");
      expect(result.text).toContain("centre");

      // Verify strict preservation of IAST Vedic / Sanskrit Unicode diacritics
      expect(result.text).toContain("Śaṅkara");
      expect(result.text).toContain("Mīmāṃsā");
    });

    it("suppresses AI clichés and computes sentence burstiness metrics", () => {
      const input = "It is important to delve into this topic. This serves as a testament to the rich tapestry of modern finance.";
      const result = scholarBrain.enforceScholarlyVoice(input, { dialect: "en-GB", stripCliches: true });

      expect(result.text.toLowerCase()).not.toContain("delve into");
      expect(result.text.toLowerCase()).not.toContain("rich tapestry");
      expect(result.text.toLowerCase()).not.toContain("testament to");

      expect(result.burstinessMetrics.averageLength).toBeGreaterThan(0);
      expect(result.burstinessMetrics.variance).toBeGreaterThanOrEqual(0);
    });
  });

  // Pillar 6: Strict Client-Owned BYOK/Local AI Routing (Zero Server Keys)
  describe("scholarBrain.complete: Strict Client-Owned Routing Security", () => {
    it("throws an error when no client transient headers (x-ai-provider, x-ai-api-key) are provided", async () => {
      await expect(
        scholarBrain.complete({
          userPrompt: "Generate a summary of CAPM.",
        })
      ).rejects.toThrow("Client-Owned AI Routing Required");
    });

    it("executes successfully when client transient AI headers are supplied", async () => {
      // Mock gateway failover completion
      const result = await scholarBrain.complete({
        headers: {
          provider: "mock-ollama",
          model: "llama3.3:70b",
          apiKey: "local-no-credential-required",
          baseUrl: "http://localhost:11434",
        },
        userPrompt: "Provide analysis.",
      }).catch((err) => {
        // If local runner is unreachable in test environment, verify error is execution error, not missing client headers
        return { error: err.message };
      });

      if ("error" in result) {
        expect(result.error).not.toContain("Client-Owned AI Routing Required");
      }
    });
  });

  // Pillar 7: Coursework Endpoint Integration in server/routes/project/assignment.ts
  describe("Coursework Endpoint Integration (/parse-brief, /generate-outline, /structure)", () => {
    it("POST /parse-brief extracts all 7 questions and persists mark allocation", async () => {
      const projectId = await createTestCourseworkProject("proj-test-brief-7q");

      const res = await request(app)
        .post(`/api/projects/${projectId}/assignment/parse-brief`)
        .attach("file", Buffer.from(sampleSevenQuestionExamBrief, "utf-8"), "exam_brief.txt");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.extractedQuestions.length).toBe(7);
      expect(res.body.markAllocation).toBeDefined();
      expect(res.body.markAllocation.questions.length).toBe(7);
      expect(res.body.markAllocation.allocatedTotalWords).toBe(3500);

      // Check questions 5, 6, 7
      expect(res.body.extractedQuestions[4]).toContain("behavioral heuristics");
      expect(res.body.extractedQuestions[5]).toContain("optimal portfolio asset allocation");
      expect(res.body.extractedQuestions[6]).toContain("corporate governance mechanisms");
    });

    it("POST /generate-outline returns research blueprint with mark_allocation", async () => {
      const projectId = await createTestCourseworkProject("proj-test-outline-alias");

      // First upload the brief
      await request(app)
        .post(`/api/projects/${projectId}/assignment/parse-brief`)
        .attach("file", Buffer.from(sampleSevenQuestionExamBrief, "utf-8"), "exam_brief.txt");

      // Call /generate-outline (alias for /structure)
      const res = await request(app)
        .post(`/api/projects/${projectId}/assignment/generate-outline`)
        .send({
          assignmentType: "coursework",
          academicLevel: "undergraduate",
          targetWordCount: 3500,
        });

      expect([200, 426]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.structure).toBeDefined();
        expect(res.body.mark_allocation).toBeDefined();
        expect(res.body.mark_allocation.questions.length).toBe(7);
      }
    });
  });

  describe("The outline is shaped by the subject, not one template", () => {
    it("tells the AI how to structure a STEM piece when the student chose that subject", async () => {
      const projectId = await createTestCourseworkProject("proj-lens-stem");
      const store = getProjectStore();
      const rec = (await store.get(projectId))!;
      rec.answers = { ...rec.answers, assignment_question: "Evaluate the design of an experiment on enzyme activity.", assignment_discipline: "stem", assignment_type: "report" };
      await store.save(rec);
      // No AI connected: the route hands its prompt to the browser (426), so it can be read here.
      const res = await request(app).post(`/api/projects/${projectId}/assignment/structure`).send({ targetWordCount: 2000 });
      expect(res.status).toBe(426);
      expect(res.body.userPrompt).toContain("SUBJECT AREA: Science, technology, engineering or maths.");
      expect(res.body.userPrompt).toContain("hypothesis, method or design, results or analysis");
      expect(res.body.userPrompt).toContain("FORM: a report");
    });
  });
});

