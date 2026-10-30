import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

export const TEST_USER_ID = "11111111-1111-4111-8111-111111111111";
vi.mock("../../src/middleware/auth.ts", () => ({
  requireAuth: (req: { user?: { id: string; email: string } }, _res: unknown, next: () => void) => {
    req.user = { id: TEST_USER_ID, email: "test@example.com" };
    next();
  },
}));

const { completeWithFailoverMock } = vi.hoisted(() => ({ completeWithFailoverMock: vi.fn() }));
vi.mock("../../../src/platform/gateway/gateway.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/platform/gateway/gateway.ts")>()),
  completeWithFailover: completeWithFailoverMock,
}));

/** Headers that give the request a (mocked) BYOK provider. */
const AI_HEADERS = { "x-ai-provider": "openai", "x-ai-model": "gpt-4o-mini", "x-ai-api-key": "test-key" };

/** A stand-in AI draft of about `words` words with varied sentence lengths. */
function fakeAiDraft(lead: string, words: number): string {
  const pool = [
    "We analyze the evidence carefully.",
    "This framing matters because the underlying behavior of the system shifts under different assumptions, and those assumptions are rarely stated explicitly in prior work.",
    "Short claims need support.",
    "Taken together, the sources suggest a coherent modeling approach that the remaining sections develop in more detail, with attention to limitations and scope.",
    "Caveats remain.",
  ];
  const out: string[] = [lead];
  let count = lead.split(/\s+/).length;
  let i = 0;
  while (count < words) {
    const s = pool[i % pool.length];
    out.push(s);
    count += s.split(/\s+/).length;
    i++;
  }
  return out.join(" ");
}

import request from "supertest";
import { app } from "../../../server.ts";
import { __resetProjectStoreForTests } from "../../../src/app/conductor/projectStore.ts";
import { getProjectStore, type ProjectRecord } from "../../../src/services/store/projectStore.ts";
import { safeParseAnswerField } from "../../../src/shared/projectStateSchema.ts";

const originalFetch = global.fetch;

beforeEach(() => {
  __resetProjectStoreForTests();
  vi.clearAllMocks();
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("Journal Rebuild Step B — Primary User Data Ingestion & Agentic Ledger", () => {
  it("1. Ingests CSV quantitative dataset via memory buffer, extracts row counts and returns [CITE:user_data_*] token", async () => {
    const store = getProjectStore();
    const proj: ProjectRecord = {
      projectId: "proj-user-data-1",
      ownerId: TEST_USER_ID,
      title: "Quantum Error Correction Project",
      intakeData: {},
      answers: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await store.save(proj);

    const csvContent = "trial_id,latency_ns,syndrome_weight,correction_status\n1,42.5,3,SUCCESS\n2,39.1,2,SUCCESS\n3,48.2,4,FAILED\n4,41.0,3,SUCCESS";

    const res = await request(app)
      .post("/api/projects/proj-user-data-1/agentic/upload-user-data")
      .attach("file", Buffer.from(csvContent, "utf-8"), "syndrome_latency_data.csv")
      .field("title", "Quantum Syndrome Latency Benchmarks")
      .field("epistemicRole", "Primary User Dataset");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.dataset).toBeDefined();
    expect(res.body.dataset.id).toMatch(/^user_data_\d+_/);
    expect(res.body.dataset.citationToken).toMatch(/^\[CITE:user_data_\d+_[a-z0-9]+\]$/);
    expect(res.body.dataset.sourceType).toBe("quantitative_dataset");
    expect(res.body.dataset.badge).toBe("Primary User Data / Upload");
    expect(res.body.dataset.title).toBe("Quantum Syndrome Latency Benchmarks");
    expect(res.body.dataset.extractedFindings).toContain("trial_id");

    // Verify stored in project answers
    const reloaded = await store.get("proj-user-data-1");
    expect(reloaded?.answers["user_datasets"]).toBeDefined();
    const datasets = safeParseAnswerField<any[]>(reloaded!.answers["user_datasets"], []);
    expect(datasets).toHaveLength(1);
    expect(datasets[0].citationToken).toBe(res.body.dataset.citationToken);
  });

  it("2. Ingests Qualitative Markdown / Text notes with NFC Unicode and IAST diacritics preservation", async () => {
    const store = getProjectStore();
    const proj: ProjectRecord = {
      projectId: "proj-user-data-2",
      ownerId: TEST_USER_ID,
      title: "Historical Sanskrit Philology",
      intakeData: {},
      answers: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await store.save(proj);

    // Text containing IAST diacritics: ā, ī, ū, ṛ, ś, ṣ, ṇ
    const mdContent = "# Archival Field Notes\n\nŚloka analysis reveals: dharmakṣetre kurukṣetre samavetā yuyutsavaḥ.\nTranscribed with exact phonetic diacritics: ā, ī, ū, ṛ, ś, ṣ, ṇ.";

    const res = await request(app)
      .post("/api/projects/proj-user-data-2/agentic/upload-user-data")
      .attach("file", Buffer.from(mdContent, "utf-8"), "archival_transcripts.md")
      .field("title", "Primary Archival Transcripts")
      .field("epistemicRole", "Methodological Anchor");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.dataset.sourceType).toBe("qualitative_document");
    expect(res.body.dataset.title).toBe("Primary Archival Transcripts");
    expect(res.body.dataset.extractedFindings).toContain("samavetā yuyutsavaḥ");
    expect(res.body.dataset.extractedFindings).toContain("ā, ī, ū, ṛ, ś, ṣ, ṇ");
  });

  it("3. Ingests direct raw text / field notes via JSON body", async () => {
    const store = getProjectStore();
    const proj: ProjectRecord = {
      projectId: "proj-user-data-3",
      ownerId: TEST_USER_ID,
      title: "Clinical Trial Analysis",
      intakeData: {},
      answers: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await store.save(proj);

    const res = await request(app)
      .post("/api/projects/proj-user-data-3/agentic/upload-user-data")
      .send({
        rawText: "Subject 104 showed elevated systolic blood pressure (142 mmHg) at 12 hours post-infusion.",
        title: "Clinical Cohort 104 Observations",
        author: "Dr. Evelyn Reed (Lead Clinician)",
        epistemicRole: "Supporting",
        assignedSectionId: "sec-results-1",
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.dataset.sourceType).toBe("field_notes");
    expect(res.body.dataset.author).toBe("Dr. Evelyn Reed (Lead Clinician)");
    expect(res.body.dataset.assignedSectionId).toBe("sec-results-1");
  });

  it("4. Updates section assignment and epistemic role via PUT /user-data/:dataId", async () => {
    const store = getProjectStore();
    const existingDataset = {
      id: "user_data_1001",
      citationToken: "[CITE:user_data_1001]",
      title: "Benchmarking Dataset",
      author: "PI",
      year: 2026,
      badge: "Primary User Data / Upload",
      sourceType: "quantitative_dataset",
      format: "csv",
      summary: "Summary",
      extractedFindings: "Initial findings",
      epistemicRole: "Supporting",
      createdAt: new Date().toISOString(),
    };

    const proj: ProjectRecord = {
      projectId: "proj-user-data-4",
      ownerId: TEST_USER_ID,
      title: "Benchmarking",
      intakeData: {},
      answers: {
        user_datasets: JSON.stringify([existingDataset]),
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await store.save(proj);

    const res = await request(app)
      .put("/api/projects/proj-user-data-4/agentic/user-data/user_data_1001")
      .send({
        assignedSectionId: "sub-sec-3-2",
        epistemicRole: "Methodological Anchor",
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.dataset.assignedSectionId).toBe("sub-sec-3-2");
    expect(res.body.dataset.epistemicRole).toBe("Methodological Anchor");

    const reloaded = await store.get("proj-user-data-4");
    const datasets = safeParseAnswerField<any[]>(reloaded!.answers["user_datasets"], []);
    expect(datasets[0].assignedSectionId).toBe("sub-sec-3-2");
    expect(datasets[0].epistemicRole).toBe("Methodological Anchor");
  });

  it("5. Automatically includes uploaded user datasets in draft-subsection citation ledger", async () => {
    const store = getProjectStore();
    const existingDataset = {
      id: "user_data_42",
      citationToken: "[CITE:user_data_42]",
      title: "Longitudinal Decoder Benchmarks",
      author: "Experimental Research Team",
      year: 2026,
      badge: "Primary User Data / Upload",
      sourceType: "quantitative_dataset",
      format: "csv",
      summary: "Empirical latency: 42ns average decoding time",
      extractedFindings: "Empirical latency: 42ns average decoding time across 10,000 runs.",
      assignedSectionId: "sec-1-sub-1",
      epistemicRole: "Primary User Dataset",
      createdAt: new Date().toISOString(),
    };

    const proj: ProjectRecord = {
      projectId: "proj-user-data-5",
      ownerId: TEST_USER_ID,
      title: "Quantum Decoder Paper",
      intakeData: {},
      answers: {
        user_datasets: JSON.stringify([existingDataset]),
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await store.save(proj);

    completeWithFailoverMock.mockResolvedValue({
      ok: true,
      value: { text: fakeAiDraft("Decoding latency was measured directly [CITE:user_data_42].", 395) },
    });
    const res = await request(app)
      .post("/api/projects/proj-user-data-5/agentic/draft-subsection")
      .set(AI_HEADERS)
      .send({
        subSectionId: "sec-1-sub-1",
        subSectionTitle: "Empirical Hardware Performance",
        targetWords: 400,
        dialect: "en-GB",
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.subSectionId).toBe("sec-1-sub-1");

    const content = res.body.content as string;
    const actualWords = res.body.actualWords as number;

    // The uploaded dataset is in the citation ledger the AI is given...
    const sentPrompt = completeWithFailoverMock.mock.calls[0][0].systemPrompt as string;
    expect(sentPrompt).toContain("user_data_42");
    // ...and the ledger resolves user_data_42 to (Team, 2026) in APA 7
    expect(content).toContain("Team, 2026");
    expect(actualWords).toBeGreaterThanOrEqual(350);
  });
});
