import { describe, it, expect, beforeEach, vi } from "vitest";

export const TEST_USER_ID = "11111111-1111-4111-8111-111111111111";
vi.mock("../../src/middleware/auth.ts", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: TEST_USER_ID, email: "test@example.com" };
    next();
  },
}));

import request from "supertest";
import { app } from "../../../server.ts";
import { __resetProjectStoreForTests } from "../../../src/app/conductor/projectStore.ts";
import { getProjectStore } from "../../../src/services/store/projectStore.ts";
import { __resetRateLimitStore } from "../../src/middleware/rateLimit.ts";
import { __setEnabledOutputTypesForTests } from "../outputTypeAccess.ts";

beforeEach(() => {
  __setEnabledOutputTypesForTests("all");
  __resetProjectStoreForTests();
  __resetRateLimitStore();
});

describe("Per-Chapter Independent Gating (long_form_chaptered)", () => {
  it("evaluates G3 and G4 per-chapter for OT-06 (Dissertation)", async () => {
    // 1. Create a project using OT-06 (Dissertation), which is long_form_chaptered.
    const resCreate = await request(app)
      .post("/api/projects")
      .send({ outputTypeId: "OT-06" });
    expect(resCreate.status).toBe(201);
    const projectId = resCreate.body.projectId;

    // 2. Answer all required G0 fields so we can pass G0 and G1.
    const resCatalog = await request(app).get("/api/atlas/output-types/OT-06");
    const requiredFields = resCatalog.body.intakeSchema.required;
    const recommendedFields = resCatalog.body.intakeSchema.recommended;
    const answers: Record<string, string> = {};
    for (const field of [...requiredFields, ...recommendedFields]) {
      answers[field.key] = "a concrete test value";
    }

    const resG0 = await request(app)
      .patch(`/api/projects/${projectId}/intake`)
      .send({ answers });
    expect(resG0.status).toBe(200);

    // Sign off G0
    const resG0Signoff = await request(app)
      .post(`/api/projects/${projectId}/gates/G0/signoff`)
      .send({ actor: "author" });
    expect(resG0Signoff.status).toBe(200);

    // 3. Put journal requirements so G1 is satisfied
    await request(app)
      .put(`/api/projects/${projectId}/journal-requirements`)
      .send({ journalName: "Test Journal" });

    // Sign off G1
    const resG1 = await request(app)
      .post(`/api/projects/${projectId}/gates/G1/signoff`)
      .send({ actor: "author" });
    expect(resG1.status).toBe(200);

    // 3.5 Put evidence ledger override so G2 is satisfied
    await request(app)
      .post(`/api/projects/${projectId}/gates/G2/accept-smaller-corpus`)
      .send({ reason: "Testing chapter gating", actor: "author" });

    const resG2 = await request(app)
      .post(`/api/projects/${projectId}/gates/G2/signoff`)
      .send({ actor: "author" });
    expect(resG2.status).toBe(200);

    // 4. Update the document, providing only one chapter ("introduction")
    const partialDoc = {
      id: projectId,
      title: "My Dissertation",
      blocks: [
        { id: "introduction", kind: "paragraph", text: "This is the intro." }
      ]
    };
    
    const resDoc = await request(app)
      .put(`/api/projects/${projectId}/document`)
      .send({ document: partialDoc });
    expect(resDoc.status).toBe(200);

    const project = await getProjectStore().get(projectId);
    expect(project).toBeDefined();

    // 5. Verify G3 state: It should be "ready" for "introduction" chapter but not for "literature_review"
    const introG3 = project!.gates.chapterGates?.["introduction"]?.["G3"];
    const litG3 = project!.gates.chapterGates?.["literature_review"]?.["G3"];

    console.log("PROJECT GATES: ", JSON.stringify(project!.gates, null, 2));

    expect(introG3?.status).toBe("ready");
    expect(litG3?.status).toBe("in_progress");

    // 6. Sign off G3 specifically for "introduction"
    const signoffG3Res = await request(app)
      .post(`/api/projects/${projectId}/gates/G3/signoff`)
      .send({ actor: "author", chapterId: "introduction" });
    
    expect(signoffG3Res.status).toBe(200);

    // 7. Verify G4 state: It should now be "ready" for "introduction" because G3 is signed off and it has non-empty text
    const updatedProject = await getProjectStore().get(projectId);
    const introG4 = updatedProject!.gates.chapterGates?.["introduction"]?.["G4"];
    
    expect(introG4?.status).toBe("ready");
  });
});
