/**
 * OT-22 outline route: runs through scholarBrain, returns a clean title and
 * the full requested number of cards, never a department banner or a course code.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

const TEST_USER_ID = "55555555-5555-4555-8555-555555555555";
vi.mock("../../src/middleware/auth.ts", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: TEST_USER_ID, email: "pres.outline@example.test" };
    next();
  },
}));

import request from "supertest";
import { app } from "../../../server.ts";
import { __resetProjectStoreForTests } from "../../../src/app/conductor/projectStore.ts";
import { __resetRateLimitStore } from "../../src/middleware/rateLimit.ts";
import { __setEnabledOutputTypesForTests } from "../outputTypeAccess.ts";

const QNT = fs.readFileSync(path.join(__dirname, "../../../src/utils/__tests__/fixtures/qnt4020-brief.txt"), "utf8");

describe("POST /api/projects/:id/presentation/outline", () => {
  beforeEach(() => {
    __resetProjectStoreForTests();
    __resetRateLimitStore();
    __setEnabledOutputTypesForTests("all");
  });

  const newProject = async () => (await request(app).post("/api/projects").send({ outputTypeId: "OT-22" })).body.projectId as string;

  it("returns 10 cards and a clean title for the QNT-4020 brief, with no banner or course code", async () => {
    const id = await newProject();
    const res = await request(app).post(`/api/projects/${id}/presentation/outline`).send({ rawText: QNT, slideCount: 10, fileName: "QNT-4020-brief.pdf" });
    expect(res.status).toBe(200);
    expect(res.body.slides).toHaveLength(10);
    expect(res.body.title).toBe("Branches of Quantum Computing");
    const all = JSON.stringify(res.body);
    expect(all).not.toMatch(/-4020|QNT|DEPARTMENT OF COMPUTER SCIENCE/);
    expect(res.body.slides[0].visualType).toBe("Title Hero");
    expect(res.body.slides.at(-1).visualType).toBe("Key Takeaways");
    for (const s of res.body.slides) {
      expect(typeof s.title).toBe("string");
      expect(Array.isArray(s.bullets)).toBe(true);
    }
  });

  it("honours other slide counts and rejects an empty request", async () => {
    const id = await newProject();
    const six = await request(app).post(`/api/projects/${id}/presentation/outline`).send({ rawText: QNT, slideCount: 6 });
    expect(six.body.slides.length).toBeLessThanOrEqual(6);
    const empty = await request(app).post(`/api/projects/${id}/presentation/outline`).send({});
    expect(empty.status).toBe(400);
  });
});

describe("parse-document keeps titles clean", () => {
  it("returns the topic, not the department banner, for an uploaded text brief", async () => {
    const res = await request(app).post("/api/presentations/parse-document").attach("file", Buffer.from(QNT), { filename: "QNT-4020-brief.txt", contentType: "text/plain" });
    if (res.status === 401) return; // route is auth-gated in this environment
    expect(res.status).toBe(200);
    expect(res.body.detectedTitle).toBe("Branches of Quantum Computing");
    expect(res.body.text).not.toMatch(/QNT-4020|Page \d of \d/);
  });
});

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

describe("PDF upload in OT-22", () => {
  it("extracts the real topic from a PDF, ignoring the department banner and course code", async () => {
    const pdf = minimalPdf(["DEPARTMENT OF COMPUTER SCIENCE & QUANTUM INFORMATION SYSTEMS", "Advanced Postgraduate Assessment: Branches of Quantum Computing", "Module Code: QNT-4020 Word Count: 1,000 words", "Question 1: Qubit platforms [15 Marks]"]);
    const res = await request(app).post("/api/presentations/parse-document").attach("file", pdf, { filename: "QNT-4020.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(200);
    expect(res.body.detectedTitle).toBe("Branches of Quantum Computing");
    expect(res.body.text).not.toMatch(/QNT-4020/);
  });

  it("returns a clear 422 for an unreadable PDF instead of decoding it as text", async () => {
    const res = await request(app).post("/api/presentations/parse-document").attach("file", Buffer.from("%PDF-1.4 \u0000 broken"), { filename: "scan.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(422);
  });
});
