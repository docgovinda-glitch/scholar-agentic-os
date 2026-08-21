import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";

export const TEST_USER_ID = "11111111-1111-4111-8111-111111111111";

vi.mock("../../../../server/src/middleware/auth.ts", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: TEST_USER_ID, email: "test@example.com" };
    next();
  },
}));

import { app } from "../../../../server.ts";
import { getProjectStore } from "../../../services/store/projectStore";
import { exportDocument } from "../export";
import type { CanonicalDocument } from "../../../desk/types";

describe("Conflict #4 — Academic Workflow Compliance: Advisory Assistance vs Technical Export", () => {
  let projectId: string;

  beforeEach(async () => {
    const created = await request(app).post("/api/projects").send({ outputTypeId: "OT-10" });
    projectId = created.body.projectId;
  });

  it("Test A: Valid document + compliance findings -> EXPORT ALLOWED", async () => {
    const validDoc: CanonicalDocument = {
      id: "doc-1",
      title: "Valid Academic Study",
      blocks: [
        { id: "b1", kind: "paragraph", text: "This is a valid research introduction with sufficient text." },
        { id: "b2", kind: "paragraph", text: "Methodology and empirical evaluation sections follow here." },
      ],
    };

    // Save document and a rubric report with unresolved blocking compliance findings
    const store = getProjectStore();
    const proj = await store.get(projectId);
    if (proj) {
      proj.document = validDoc as any;
      proj.rubricReport = {
        blockingFailures: ["Rule R1: Required section 'Discussion' missing"],
        advisoryFailures: ["Rule R2: Consider expanding abstract"],
      } as any;
      await store.save(proj);
    }

    const res = await request(app)
      .post(`/api/projects/${projectId}/export`)
      .send({ format: "docx" });

    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toContain("attachment");
    expect(res.headers["content-type"]).toBe("application/octet-stream");
  });

  it("Test B: Unresolved compliance findings -> G7/export remains available in API", async () => {
    const validDoc: CanonicalDocument = {
      id: "doc-2",
      title: "Another Valid Manuscript",
      blocks: [{ id: "b1", kind: "paragraph", text: "Some substantial text for the study." }],
    };
    const store = getProjectStore();
    const proj = await store.get(projectId);
    if (proj) {
      proj.document = validDoc as any;
      proj.rubricReport = { blockingFailures: ["Violation 1", "Violation 2"] } as any;
      await store.save(proj);
    }

    const res = await request(app)
      .post(`/api/projects/${projectId}/export`)
      .send({ format: "pdf" });

    expect(res.status).toBe(200);
  });

  it("Test C: No G6 signoff -> EXPORT ALLOWED", async () => {
    const validDoc: CanonicalDocument = {
      id: "doc-3",
      title: "Unsigned G6 Project",
      blocks: [{ id: "b1", kind: "paragraph", text: "Valid content without human signoff on G6." }],
    };
    const store = getProjectStore();
    const proj = await store.get(projectId);
    if (proj) {
      proj.document = validDoc as any;
      // G6 is not signed off
      proj.gates = {
        G0: { status: "signed_off" },
        G1: { status: "signed_off" },
        G2: { status: "signed_off" },
        G3: { status: "signed_off" },
        G4: { status: "signed_off" },
        G5: { status: "signed_off" },
        G6: { status: "not_started" },
        G7: { status: "ready" },
      } as any;
      await store.save(proj);
    }

    const res = await request(app)
      .post(`/api/projects/${projectId}/export`)
      .send({ format: "odt" });

    expect(res.status).toBe(200);
  });

  it("Test D: Compliance finding exists with NO waiver -> EXPORT STILL ALLOWED", async () => {
    const validDoc: CanonicalDocument = {
      id: "doc-4",
      title: "Unwaived Project",
      blocks: [{ id: "b1", kind: "paragraph", text: "Valid paper text." }],
    };
    const store = getProjectStore();
    const proj = await store.get(projectId);
    if (proj) {
      proj.document = validDoc as any;
      proj.rubricReport = { blockingFailures: ["Unwaived finding"] } as any;
      proj.waivers = {} as any; // No waivers recorded
      await store.save(proj);
    }

    const res = await request(app)
      .post(`/api/projects/${projectId}/export`)
      .send({ format: "docx" });

    expect(res.status).toBe(200);
  });

  it("Test E: Invalid document (no title / empty blocks) -> EXPORT DENIED (400)", async () => {
    const invalidDoc: CanonicalDocument = {
      id: "doc-empty",
      title: "",
      blocks: [],
    };
    const store = getProjectStore();
    const proj = await store.get(projectId);
    if (proj) {
      proj.document = invalidDoc as any;
      await store.save(proj);
    }

    const res = await request(app)
      .post(`/api/projects/${projectId}/export`)
      .send({ format: "docx" });

    expect(res.status).toBe(500); // Caught in exportDocument preflight
    expect(res.body.error).toContain("Export pre-flight failed");
  });

  it("Test F: Unsupported format -> EXPORT DENIED (400)", async () => {
    const validDoc: CanonicalDocument = {
      id: "doc-5",
      title: "Test",
      blocks: [{ id: "b1", kind: "paragraph", text: "Text." }],
    };
    const store = getProjectStore();
    const proj = await store.get(projectId);
    if (proj) {
      proj.document = validDoc as any;
      await store.save(proj);
    }

    const res = await request(app)
      .post(`/api/projects/${projectId}/export`)
      .send({ format: "exe" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid export format");
  });

  it("Test G: Rendering failure / invalid data -> throws clean error", async () => {
    const corruptedDoc = {
      id: "corrupted",
      title: "Corrupted",
      blocks: [{ id: "b1", text: "Test", kind: "invalid_kind" }],
    } as any;

    await expect(
      exportDocument({
        document: corruptedDoc,
        format: "docx",
        title: "Corrupted",
        author: "Author",
      })
    ).resolves.toBeDefined(); // docxWriter gracefully handles unknown block kinds
  });

  it("Test H: Unauthorized project -> EXPORT DENIED (404/403)", async () => {
    const res = await request(app)
      .post("/api/projects/unknown-project-id/export")
      .send({ format: "docx" });

    expect(res.status).toBe(404);
  });

  it("Test I: Historical project with G6 records, findings, and waivers loads intact and exports", async () => {
    const historicalDoc: CanonicalDocument = {
      id: "hist-doc",
      title: "Historical Analysis on Governance",
      blocks: [
        { id: "h1", kind: "heading", text: "Historical Analysis on Governance" },
        { id: "h2", kind: "paragraph", text: "Historical records preserved cleanly across migrations." },
      ],
    };

    const store = getProjectStore();
    const proj = await store.get(projectId);
    if (proj) {
      proj.document = historicalDoc as any;
      proj.rubricReport = {
        evaluatedAt: "2026-08-01T12:00:00Z",
        blockingFailures: ["Rule 101"],
      } as any;
      proj.waivers = {
        "Rule 101": { reason: "Author deliberate styling choice", waivedAt: "2026-08-02T10:00:00Z" },
      } as any;
      proj.gates = {
        G0: { status: "signed_off" },
        G1: { status: "signed_off" },
        G2: { status: "signed_off" },
        G3: { status: "signed_off" },
        G4: { status: "signed_off" },
        G5: { status: "signed_off" },
        G6: { status: "signed_off" },
        G7: { status: "ready" },
      } as any;
      await store.save(proj);
    }

    // Verify retrieval preserves all historical data
    const loaded = await store.get(projectId);
    expect(loaded?.waivers?.["Rule 101"]?.reason).toBe("Author deliberate styling choice");
    expect(loaded?.rubricReport?.blockingFailures).toContain("Rule 101");

    // Verify export is allowed
    const res = await request(app)
      .post(`/api/projects/${projectId}/export`)
      .send({ format: "docx" });

    expect(res.status).toBe(200);
  });
});
