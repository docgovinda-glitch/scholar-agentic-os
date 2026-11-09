/**
 * Uploading a PDF brief returns its text, the real word count (course code
 * ignored) and level/citation hints on the first request.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const TEST_USER_ID = "44444444-4444-4444-8444-444444444444";
vi.mock("../../src/middleware/auth.ts", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: TEST_USER_ID, email: "pdf.brief@example.test" };
    next();
  },
}));

import request from "supertest";
import { app } from "../../../server.ts";
import { __resetProjectStoreForTests } from "../../../src/app/conductor/projectStore.ts";
import { getProjectStore } from "../../../src/services/store/projectStore.ts";

process.env.SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_pdf_test";

function minimalPdf(lines: string[]): Buffer {
  const content = `BT /F1 12 Tf 50 750 Td 16 TL\n${lines.map((t) => `(${t.replace(/[()]/g, "[")}) Tj T*`).join("\n")}\nET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offs: number[] = [];
  objs.forEach((o, i) => {
    offs.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const x = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

async function createProject(): Promise<string> {
  const project = {
    projectId: "proj-pdf-brief",
    ownerId: TEST_USER_ID,
    schemaVersion: 1,
    outputTypeId: "OT-01",
    answers: {},
    gates: [],
    manuscriptJob: null,
    peerReviewHistory: { rounds: [] },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await getProjectStore().save(project as any);
  return project.projectId;
}

beforeEach(() => __resetProjectStoreForTests());

describe("parse-brief with a PDF", () => {
  it("extracts the text and the real word count on the first upload", async () => {
    const id = await createProject();
    const pdf = minimalPdf(["Module Code: QNT-4020 Word Count: 2,000 words", "Referencing: Harvard", "Q1a. Compare transmon and trapped-ion qubits. [5 Marks]"]);
    const res = await request(app).post(`/api/projects/${id}/assignment/parse-brief`).attach("file", pdf, { filename: "brief.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(200);
    expect(res.body.text).toContain("Compare transmon and trapped-ion qubits");
    expect(res.body.detectedWordCount).toBe(2000);
  });

  it("accepts a PDF sent with a generic octet-stream type", async () => {
    const id = await createProject();
    const pdf = minimalPdf(["Word Count: 1,500 words", "Discuss the topic in depth."]);
    const res = await request(app).post(`/api/projects/${id}/assignment/parse-brief`).attach("file", pdf, { filename: "brief.pdf", contentType: "application/octet-stream" });
    expect(res.status).toBe(200);
    expect(res.body.detectedWordCount).toBe(1500);
  });
});

describe("parse-brief with an unreadable PDF", () => {
  it("returns a clear 422 instead of decoding the binary as text", async () => {
    const id = await createProject();
    const res = await request(app)
      .post(`/api/projects/${id}/assignment/parse-brief`)
      .attach("file", Buffer.from("%PDF-1.4\n\u0000\u0001 not really a pdf"), { filename: "scan.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("brief_unreadable");
  });
});
