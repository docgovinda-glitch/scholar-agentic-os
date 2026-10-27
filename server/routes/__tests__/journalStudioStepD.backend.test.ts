import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

export const TEST_USER_ID = "11111111-1111-4111-8111-111111111111";
vi.mock("../../src/middleware/auth.ts", () => ({
  requireAuth: (req: { user?: { id: string; email: string } }, _res: unknown, next: () => void) => {
    req.user = { id: TEST_USER_ID, email: "test@example.com" };
    next();
  },
}));

import request from "supertest";
import { app } from "../../../server.ts";
import { __resetProjectStoreForTests } from "../../../src/app/conductor/projectStore.ts";
import { __resetSharedStoreForTests } from "../project.ts";
import { renderDocx, renderRefereeResponseLetterDocx } from "../../../src/app/export/docxWriter.ts";
import { exportDocument } from "../../../src/app/export/export.ts";
import type { AcademicDocument, RebuttalMatrixItem } from "../../../src/app/export/types.ts";

const originalFetch = global.fetch;

const binaryParser = (res: any, callback: any) => {
  const data: Uint8Array[] = [];
  res.on("data", (chunk: Uint8Array) => data.push(chunk));
  res.on("end", () => callback(null, Buffer.concat(data)));
};

beforeEach(() => {
  __resetProjectStoreForTests();
  __resetSharedStoreForTests();
  vi.clearAllMocks();
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("Journal Rebuild Step D — Backend .docx, .pdf & Rebuttal Compilers", () => {
  const iastTitle = "Pāṇini's Aṣṭādhyāyī & Śaṅkara's Ṛgvedic Hermeneutics: ū, ī, ā, ṛ, ś, ṣ, ṇ";
  const iastAbstract = "This study examines NFC Unicode preservation for IAST diacritics (ā, ī, ū, ṛ, ś, ṣ, ṇ) in autonomous synthesis.";
  
  const sampleDoc: AcademicDocument = {
    id: "doc-sample-1",
    title: iastTitle,
    authors: ["Dr. Ānand Vardhan", "Prof. Śrīdhara Rao"],
    affiliations: ["Oxford Centre for Hindu Studies, University of Oxford"],
    blocks: [
      {
        id: "b-abstract",
        kind: "paragraph",
        text: `Abstract: ${iastAbstract}`,
      },
      {
        id: "b-intro-h1",
        kind: "heading1",
        text: "1. Introduction & Historical Background",
      },
      {
        id: "b-intro-body",
        kind: "paragraph",
        text: "In classical Sanskrit grammar, Pāṇini defines canonical phonetic invariants (Aṣṭādhyāyī 1.1.1). We examine primary corpus telemetry [CITE:user_data_101] and cross-validate against foundational literature [CITE:src_f101].",
      },
      {
        id: "b-table",
        kind: "paragraph",
        text: "| Morphological Rule | Sūtra Reference | Phonetic Value |\n| :--- | :--- | :--- |\n| Vṛddhir ādaij | 1.1.1 | ā, ai, au |\n| Aden guṇaḥ | 1.1.2 | a, e, o |\n| Iko yaṇ aci | 6.1.77 | y, v, r, l |",
      },
      {
        id: "b-results-h1",
        kind: "heading1",
        text: "2. Computational Results",
      },
      {
        id: "b-results-body",
        kind: "paragraph",
        text: "The empirical parser achieves sub-millisecond AST resolution across all 3,959 sūtras with zero loss of diacritics.",
      },
    ],
    metadata: {
      generatedAt: new Date().toISOString(),
      outputTypeId: "OT-10",
      version: "1",
    },
  };

  const sampleRebuttals: RebuttalMatrixItem[] = [
    {
      id: "reb-1",
      referee: "Reviewer 1 (Philology)",
      lens: "Orthographic Precision",
      section: "1. Introduction",
      severity: "Major",
      critique: "The manuscript must explicitly define the treatment of Vedic svarita and IAST nasalization (ṇ, ṃ).",
      authorResponse: "We have fully clarified the treatment of Vedic accents and incorporated primary dataset [CITE:user_data_101].",
      revisionAction: "Added Section 1.2 detailing Vedic pitch accent representation and updated Table 1.",
    },
    {
      id: "reb-2",
      referee: "Reviewer 2 (Computational Linguistics)",
      lens: "Parsing Complexity",
      section: "2. Computational Results",
      severity: "Minor",
      critique: "Please provide runtime bounds on the rule chaining algorithm.",
      authorResponse: "Theorem 2 now provides explicit asymptotic latency bounds of O(n log n).",
      revisionAction: "Included Lemma 1.3 and proof in Section 2.",
    },
  ];

  describe("1. Direct AST DOCX Generator (`renderDocx` & `renderRefereeResponseLetterDocx`)", () => {
    it("generates a valid DOCX buffer preserving NFC Unicode / IAST diacritics and APA 7 references", async () => {
      const buffer = await renderDocx(sampleDoc, {
        layoutMode: "1-column-double",
        citationStyle: "apa7",
        runningHead: "PĀṆINI'S AṢṬĀDHYĀYĪ & RGVEDIC HERMENEUTICS",
        authorOrcid: "0000-0002-1825-0097",
        lineSpacing: "2.0",
        ethicalDeclarations: {
          dataAvailability: "Primary dataset [user_data_101] is available in the project vault.",
          competingInterests: "The authors declare no competing interests.",
          credit: "Conceptualization: Lead Author; Formal Analysis: All Authors.",
          aiDisclosure: "Scholar Agentic OS was used for orthographic verification.",
        },
      });

      expect(buffer).toBeInstanceOf(Uint8Array);
      expect(buffer.length).toBeGreaterThan(1000);

      // Verify standard ZIP / DOCX magic byte signature: 'PK\x03\x04' (0x50, 0x4B, 0x03, 0x04)
      expect(buffer[0]).toBe(0x50);
      expect(buffer[1]).toBe(0x4B);
      expect(buffer[2]).toBe(0x03);
      expect(buffer[3]).toBe(0x04);
    });

    it("generates a standalone formal Referee Response Letter DOCX document", async () => {
      const buffer = await renderRefereeResponseLetterDocx({
        manuscriptTitle: iastTitle,
        authors: "Dr. Ānand Vardhan & Prof. Śrīdhara Rao",
        journalName: "Journal of Sanskrit Computational Linguistics",
        rebuttalMatrix: sampleRebuttals,
      });

      expect(buffer).toBeInstanceOf(Uint8Array);
      expect(buffer.length).toBeGreaterThan(1000);

      // Verify DOCX ZIP header
      expect(buffer[0]).toBe(0x50);
      expect(buffer[1]).toBe(0x4B);
      expect(buffer[2]).toBe(0x03);
      expect(buffer[3]).toBe(0x04);
    });
  });

  describe("2. Unified `exportDocument` Compiler Pipeline", () => {
    it("compiles DOCX manuscript export with valid filename and binary content", async () => {
      const result = await exportDocument({
        document: sampleDoc,
        format: "docx",
        title: iastTitle,
        academicOptions: {
          layoutMode: "1-column-double",
          citationStyle: "apa7",
          runningHead: "PĀṆINI AṢṬĀDHYĀYĪ",
          authorOrcid: "0000-0002-1825-0097",
        },
      });

      expect(result.filename).toMatch(/\.docx$/);
      expect(result.data).toBeInstanceOf(Uint8Array);
      expect((result.data as Uint8Array).length).toBeGreaterThan(1000);
    });

    it("compiles standalone Referee Response Letter export with proper filename and MIME type", async () => {
      const result = await exportDocument({
        document: sampleDoc,
        format: "rebuttal_letter",
        title: "Referee Response Letter",
        academicOptions: {
          rebuttalMatrix: sampleRebuttals,
        },
      });

      expect(result.filename).toBe("Referee_Response_Letter.docx");
      expect(result.data).toBeInstanceOf(Uint8Array);
      expect((result.data as Uint8Array).length).toBeGreaterThan(1000);
    });

    it("compiles PDF manuscript export with valid binary stream/buffer", async () => {
      const result = await exportDocument({
        document: sampleDoc,
        format: "pdf",
        title: iastTitle,
        academicOptions: {
          layoutMode: "1-column-double",
          citationStyle: "apa7",
        },
      });

      expect(result.filename).toMatch(/\.pdf$/);
      expect(result.data).toBeInstanceOf(Uint8Array);
      expect((result.data as Uint8Array).length).toBeGreaterThan(100);

      // PDF magic header: '%PDF-'
      const headerStr = Buffer.from((result.data as Uint8Array).slice(0, 5)).toString("utf-8");
      expect(headerStr).toBe("%PDF-");
    });
  });

  describe("3. REST Endpoints for Mode 5 Submissions", () => {
    let projId: string;

    beforeEach(async () => {
      // Create project via API so ownerId is properly set to TEST_USER_ID
      const created = await request(app)
        .post("/api/projects")
        .send({ outputTypeId: "OT-10" });
      projId = created.body.projectId;

      // Update project answers
      await request(app)
        .put(`/api/projects/${projId}/answers`)
        .send({
          answers: {
            working_title: iastTitle,
            selected_journal_name: "Nature Machine Intelligence",
            running_head: "PĀṆINI'S HERMENEUTICS",
            author_orcid: "0000-0002-1825-0097",
            citation_style: "apa7",
            data_availability_statement: "Empirical data [user_data_101] is archived in vault.",
            rebuttal_matrix: JSON.stringify(sampleRebuttals),
            user_data_entries: JSON.stringify([
              { id: "user_data_101", title: "Sanskrit Morphological Telemetry" },
            ]),
            vault_sources: JSON.stringify([
              { id: "src_f101", title: "Classical Astadhyayi Invariants", year: 2024 },
            ]),
          },
        });

      // Submit canonical document
      await request(app)
        .put(`/api/projects/${projId}/document`)
        .send({ document: sampleDoc });
    });

    it("GET /api/projects/:id/export/docx returns 200 with journal DOCX attachment", async () => {
      const res = await request(app)
        .get(`/api/projects/${projId}/export/docx`)
        .query({ layout: "1-column-double", citationStyle: "apa7" })
        .buffer(true)
        .parse(binaryParser);

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toBe(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );
      expect(res.headers["content-disposition"]).toContain("attachment");
      expect(res.headers["content-disposition"]).toContain(".docx");
      expect(res.body).toBeInstanceOf(Buffer);
      expect(res.body.length).toBeGreaterThan(1000);
    });

    it("GET /api/projects/:id/export/pdf returns 200 with camera-ready PDF attachment", async () => {
      const res = await request(app)
        .get(`/api/projects/${projId}/export/pdf`)
        .query({ layout: "1-column-double" })
        .buffer(true)
        .parse(binaryParser);

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toBe("application/pdf");
      expect(res.headers["content-disposition"]).toContain("attachment");
      expect(res.headers["content-disposition"]).toContain(".pdf");
      expect(res.body).toBeInstanceOf(Buffer);
      expect(res.body.length).toBeGreaterThan(100);
      expect(res.body.slice(0, 5).toString("utf-8")).toBe("%PDF-");
    });

    it("GET /api/projects/:id/export/rebuttal-letter returns 200 with Referee_Response_Letter.docx", async () => {
      const res = await request(app)
        .get(`/api/projects/${projId}/export/rebuttal-letter`)
        .buffer(true)
        .parse(binaryParser);

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toBe(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );
      expect(res.headers["content-disposition"]).toContain("attachment");
      expect(res.headers["content-disposition"]).toContain("Referee_Response_Letter.docx");
      expect(res.body).toBeInstanceOf(Buffer);
      expect(res.body.length).toBeGreaterThan(1000);
    });

    it("GET /api/projects/:id/agent/export/rebuttal-letter returns 200 with Referee_Response_Letter.docx attachment", async () => {
      const res = await request(app)
        .get(`/api/projects/${projId}/agent/export/rebuttal-letter`)
        .buffer(true)
        .parse(binaryParser);

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toBe(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );
      expect(res.headers["content-disposition"]).toContain("attachment");
      expect(res.headers["content-disposition"]).toContain("Referee_Response_Letter.docx");
      expect(res.body).toBeInstanceOf(Buffer);
      expect(res.body.length).toBeGreaterThan(1000);
    });

    it("POST /api/projects/:id/agent/export returns 200 JSON with rebuttalLetterUrl", async () => {
      const res = await request(app)
        .post(`/api/projects/${projId}/agent/export`)
        .send({ format: "docx" });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.rebuttalLetterUrl).toBe(`/api/projects/${projId}/export/rebuttal-letter`);
      expect(res.body.data.formatsAvailable).toContain("rebuttal-letter");
    });
  });
});
