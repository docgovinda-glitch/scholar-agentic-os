/**
 * Comprehensive Vitest integration tests for Journal Article Pipeline Completion (Stages 20-25).
 * Tests:
 * 1. Stages 20-22: 5-Referee Adversarial Peer Review & Point-by-Point Rebuttal Matrix persistence.
 * 2. Stage 23: Discourse-Level Humanized Copy-Editing & Term-Locked Polishing (/final-editor).
 * 3. Stage 24: Conductor Gate G7 Audit, 100% Citation Vault Reconciliation & 2026 ICMJE Checklist (/publication-readiness).
 * 4. Stage 25: Canonical Multi-Format Scholarly Exporter (/export & /export/:format).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

export const TEST_USER_ID = "22222222-2222-4222-8222-222222222222";
vi.mock("../../src/middleware/auth.ts", () => ({
  requireAuth: (req: { user?: { id: string; email: string } }, _res: unknown, next: () => void) => {
    req.user = { id: TEST_USER_ID, email: "scholar@example.com" };
    next();
  },
}));

import request from "supertest";
import { app } from "../../../server.ts";
import { __resetProjectStoreForTests } from "../../../src/app/conductor/projectStore.ts";
import { getProjectStore } from "../../../src/services/store/projectStore.ts";
import type { ProjectRecord } from "../../../src/types/project.ts";
import { safeParseAnswerField } from "../../../src/shared/projectStateSchema.ts";

process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test";

const originalFetch = global.fetch;

beforeEach(() => {
  __resetProjectStoreForTests();
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

async function createStageProject(answers: Record<string, unknown> = {}): Promise<string> {
  const store = getProjectStore();
  const project: ProjectRecord = {
    projectId: "proj-stages-20-25-test",
    ownerId: TEST_USER_ID,
    schemaVersion: 1,
    outputTypeId: "OT-10",
    answers: {
      working_title: "Provable Invariants in Autonomous Multi-Agent Consensus",
      selected_journal_name: "Nature Machine Intelligence",
      identified_gaps: JSON.stringify([
        { id: "gap-1", title: "Asymmetric Partition Byzantine Fault Tolerance" },
      ]),
      manuscript_draft: JSON.stringify([
        {
          section: "Introduction",
          content: "We delve into the intricate tapestry of consensus systems (Smith, 2024). It underscores pivotal bounds [1]. p < 0.001.",
        },
        {
          section: "Methodology",
          content: "Let us generalize the protocol parameters under variance $\\sigma^2 = 0.05$ (Doe & Jones, 2023).",
        },
      ]),
      manuscript_markdown: "## Introduction\nWe delve into the intricate tapestry of consensus systems (Smith, 2024). It underscores pivotal bounds [1]. p < 0.001.\n\n## Methodology\nLet us generalize the protocol parameters under variance $\\sigma^2 = 0.05$ (Doe & Jones, 2023).",
      vault_sources: JSON.stringify([
        { id: "v1", title: "Robust Consensus in Asynchronous Networks", author: "Smith", year: 2024 },
        { id: "v2", title: "Stochastic Partition Modeling", author: "Doe & Jones", year: 2023 },
      ]),
      ...answers,
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

describe("Stages 20-22: 5-Referee Peer Review & Point-by-Point Rebuttal Matrix", () => {
  // Rewritten for P0-12: with no critiques the route used to invent five canned
  // referee critiques and pre-written "addressed" author responses, and this test
  // asserted them. The matrix is now built only from the project's real critiques,
  // with the author's response left for the author.
  it("builds the rebuttal matrix from the project's own critiques and persists author revisions", async () => {
    const empty = await createStageProject();
    const none = await request(app).get(`/api/projects/${empty}/agent/rebuttal-matrix`);
    expect(none.status).toBe(200);
    expect(none.body.data).toEqual([]);
    const noCritiques = await request(app).post(`/api/projects/${empty}/agent/rebuttal-matrix`).send({});
    expect(noCritiques.status).toBe(400);

    const projectId = await createStageProject({
      peer_review_critiques: JSON.stringify([
        { id: "c1", refereeRole: "Methodologist", critiqueLens: "Rigor", section: "Methods", severity: "Major", critique: "Sample size is not justified." },
        { id: "c2", refereeRole: "Formal Editor", critiqueLens: "Style", section: "Abstract", severity: "Minor", critique: "Abstract exceeds 250 words." },
      ]),
    });
    const getRes = await request(app).get(`/api/projects/${projectId}/agent/rebuttal-matrix`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.map((r: { critique: string }) => r.critique)).toEqual([
      "Sample size is not justified.",
      "Abstract exceeds 250 words.",
    ]);
    for (const row of getRes.body.data) {
      expect(row.authorResponse).toBe("");
      expect(row.status).toBe("pending");
      expect(row.diff).toBeUndefined();
    }

    // 2. Persist custom author revisions to the rebuttal matrix
    const customMatrix = [
      {
        id: "rebuttal-1",
        refereeRole: "Methodologist",
        lens: "Methodological Rigor",
        critiqueSummary: "Sample bounds require deterministic boundary condition proofs.",
        authorResponse: "We have formulated Lemma 1 and accompanying mathematical proof in Section 2.",
        revisionAction: "Added Lemma 1 and formal proof.",
        status: "Accepted",
        sectionAffected: "Methodology",
        originalSnippet: "variance $\\sigma^2 = 0.05$",
        revisedSnippet: "variance $\\sigma^2 \\le 0.05$ satisfying Lemma 1",
      },
    ];

    const postRes = await request(app)
      .post(`/api/projects/${projectId}/agent/rebuttal-matrix`)
      .send({ matrix: customMatrix });

    expect(postRes.status).toBe(200);
    expect(postRes.body.ok).toBe(true);
    expect(postRes.body.count).toBe(1);

    // Verify persisted in store
    const store = getProjectStore();
    const updated = await store.get(projectId);
    expect(updated?.answers?.["rebuttal_matrix"]).toBeDefined();
    const parsed = safeParseAnswerField<any[]>(updated?.answers?.["rebuttal_matrix"], []);
    expect(parsed[0].refereeRole).toBe("Methodologist");
    expect(parsed[0].authorResponse).toContain("Lemma 1");
  });
});

describe("Stage 23: Discourse-Level Humanized Copy-Editing (/final-editor)", () => {
  it("refuses to polish anything when the project has no manuscript (no demo stand-in text)", async () => {
    const projectId = await createStageProject({ manuscript_draft: "", manuscript_markdown: "" });
    const res = await request(app).post(`/api/projects/${projectId}/agent/final-editor`).send({});
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toMatch(/94\.2%|p < 0\.001|Vaswani/);
  });

  it("executes copy-editing pass suppressing clichés, enforcing British orthography and NFC diacritics while preserving citations", async () => {
    const projectId = await createStageProject();

    const sampleSection = "We delve into the intricate tapestry of consensus systems (Smith, 2024). It is worth noting that this underscores pivotal bounds [1] with DOI 10.1038/s41586-024-0001. We generalize the behavior under p < 0.001 and Schrödinger wave equation.";

    const res = await request(app)
      .post(`/api/projects/${projectId}/agent/final-editor`)
      .send({
        manuscript: sampleSection,
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const { polishedText, telemetry, styleCorrections } = res.body.data;
    expect(typeof polishedText).toBe("string");

    // a. Cliché suppression check
    expect(polishedText.toLowerCase()).not.toContain("delve into");
    expect(polishedText.toLowerCase()).not.toContain("intricate tapestry");
    expect(polishedText.toLowerCase()).not.toContain("underscores");
    expect(polishedText.toLowerCase()).not.toContain("it is worth noting that");

    // b. British spelling check (-ize -> -ise)
    expect(polishedText).toContain("generalise");

    // c. Strict Citation & Data Lock preservation
    expect(polishedText).toContain("(Smith, 2024)");
    expect(polishedText).toContain("[1]");
    expect(polishedText).toContain("10.1038/s41586-024-0001");
    expect(polishedText).toContain("p < 0.001");

    // d. Telemetry & issue tracking
    expect(telemetry).toBeDefined();
    expect(telemetry.burstinessAfter).toBeDefined();
    expect(telemetry.fleschKincaidGrade).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(styleCorrections)).toBe(true);
    expect(styleCorrections.length).toBeGreaterThan(0);

    // Verify persistence in project record
    const store = getProjectStore();
    const updated = await store.get(projectId);
    expect(updated?.answers?.["final_editor_telemetry"]).toBeDefined();
  });
});

describe("Stage 24: Conductor Gate G7 Audit & Citation Reconciliation (/publication-readiness)", () => {
  it("computes live Gate G7 exit criteria, 100% citation reconciliation, and 2026 ICMJE checklist", async () => {
    const uncitedText = "Previous findings (Smith, 2024) confirmed the theorem. However, an unverified author (Uncited, 2025) claimed otherwise.";
    const projectId = await createStageProject({
      manuscript_markdown: uncitedText,
      full_text_markdown: uncitedText,
      assembled_draft: uncitedText,
      manuscript_draft: JSON.stringify([
        {
          section: "Introduction",
          content: uncitedText,
        },
      ]),
      vault_sources: JSON.stringify([
        { id: "v1", title: "Robust Consensus", author: "Smith", year: 2024 },
        { id: "v2", title: "Unused Source", author: "Orphan", year: 2022 },
      ]),
    });

    const res = await request(app)
      .post(`/api/projects/${projectId}/agent/publication-readiness`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const { gateG7, citationReconciliation, ethics2026Checklist, checks } = res.body.data;

    // 1. Conductor Gate G7 scorecard
    expect(gateG7).toBeDefined();
    expect(typeof gateG7.score).toBe("number");
    expect(Array.isArray(gateG7.blockingCriteria)).toBe(true);
    expect(Array.isArray(gateG7.advisoryCriteria)).toBe(true);

    // 2. Citation Vault Reconciliation
    expect(citationReconciliation).toBeDefined();
    expect(citationReconciliation.totalInTextCitations).toBeGreaterThanOrEqual(1);
    expect(citationReconciliation.vaultMatchCount).toBeGreaterThanOrEqual(1);
    // Uncited author should be flagged as orphan citation
    expect(citationReconciliation.orphanCitations.length).toBeGreaterThanOrEqual(1);
    expect(citationReconciliation.orphanCitations).toContain("Uncited, 2025");
    // Orphan vault item should be flagged as uncited bibliography
    expect(citationReconciliation.uncitedVaultItems.length).toBeGreaterThanOrEqual(1);

    // 3. 2026 ICMJE/COPE ethics checklist
    expect(ethics2026Checklist).toBeDefined();
    expect(ethics2026Checklist.dataAvailability).toBeDefined();
    expect(ethics2026Checklist.aiDisclosure).toBeDefined();

    // 4. Persistence verification
    const store = getProjectStore();
    const updated = await store.get(projectId);
    expect(updated?.answers?.["publication_readiness"]).toBeDefined();
    expect(updated?.answers?.["publication_readiness_completed"]).toBe("true");
  });
});

describe("Stage 25: Canonical Multi-Format Scholarly Exporter (/export & /export/:format)", () => {
  it("compiles multi-format submission package with citation style selection and 5-referee rebuttal appendix", async () => {
    const projectId = await createStageProject();

    // 1. Agent export configuration pass
    const exportRes = await request(app)
      .post(`/api/projects/${projectId}/agent/export`)
      .send({
        template: "nature",
        citationStyle: "apa7",
        includeRebuttalAppendix: true,
      });

    expect(exportRes.status).toBe(200);
    expect(exportRes.body.ok).toBe(true);
    expect(exportRes.body.data.success).toBe(true);
    expect(exportRes.body.data.template).toBe("nature");
    expect(exportRes.body.data.citationStyle).toBe("apa7");
    expect(exportRes.body.data.hasRebuttalAppendix).toBe(true);
    expect(exportRes.body.data.pdfUrl).toBeDefined();
    expect(exportRes.body.data.latexUrl).toBeDefined();

    // 2. Direct format downloads via /export/:format
    // a. Markdown (.md)
    const mdRes = await request(app)
      .post(`/api/projects/${projectId}/export/markdown`)
      .send({ template: "nature", citationStyle: "apa7", includeRebuttalAppendix: true });
    expect(mdRes.status).toBe(200);
    expect(mdRes.headers["content-type"]).toContain("text/markdown");
    expect(mdRes.text).toContain("Provable Invariants in Autonomous Multi-Agent Consensus");

    // b. LaTeX (.tex)
    const texRes = await request(app)
      .post(`/api/projects/${projectId}/export/latex`)
      .send({ template: "nature" });
    expect(texRes.status).toBe(200);
    expect(texRes.headers["content-type"]).toContain("octet-stream");

    // c. Typst (.typ)
    const typstRes = await request(app)
      .post(`/api/projects/${projectId}/export/typst`)
      .send({ template: "nature" });
    expect(typstRes.status).toBe(200);
    expect(typstRes.headers["content-type"]).toContain("octet-stream");

    // d. DOCX
    const docxRes = await request(app)
      .post(`/api/projects/${projectId}/export/docx`)
      .send({ template: "nature" });
    expect(docxRes.status).toBe(200);
    expect(docxRes.headers["content-type"]).toMatch(/octet-stream|wordprocessingml\.document/);
  });
});
