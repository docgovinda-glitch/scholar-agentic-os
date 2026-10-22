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
import { __resetRateLimitStore } from "../../src/middleware/rateLimit.ts";
import { __setEnabledOutputTypesForTests } from "../outputTypeAccess.ts";

describe("Presentation Studio Endpoints (/api/projects/:id/presentation)", () => {
  beforeEach(() => {
    __resetProjectStoreForTests();
    __resetRateLimitStore();
    __setEnabledOutputTypesForTests("all");
  });

  async function createPresentationProject(): Promise<string> {
    const res = await request(app)
      .post("/api/projects")
      .send({ outputTypeId: "OT-22" });
    return res.body.projectId;
  }

  it("POST /generate-deck returns structured 16:9 presentation deck synthesized from project metadata", async () => {
    const projectId = await createPresentationProject();

    const payload = {
      title: "Autonomous Cryptographic Verification of Empirical Scientific Literature",
      durationMinutes: 15,
      targetAudience: "International Conference on Machine Learning (ICML)",
      narrativeFramework: "Standard-Narrative",
    };

    const res = await request(app)
      .post(`/api/projects/${projectId}/presentation/generate-deck`)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.deckTitle).toContain("Autonomous Cryptographic Verification");
    expect(res.body.totalSlides).toBeGreaterThanOrEqual(5);
    expect(res.body.estimatedDurationMinutes).toBe(15);
    expect(Array.isArray(res.body.slides)).toBe(true);

    const slideTypes = res.body.slides.map((s: any) => s.type);
    expect(slideTypes).toContain("title");
    expect(slideTypes).toContain("problem_gap");
    expect(slideTypes).toContain("framework_methodology");
    expect(slideTypes).toContain("empirical_findings");
    expect(slideTypes).toContain("discussion_implications");

    // Verify slide schema and 6x6 constraints
    for (const slide of res.body.slides) {
      expect(slide.slideNumber).toBeGreaterThanOrEqual(1);
      expect(slide.title).toBeTruthy();
      expect(slide.subtitle).toBeTruthy();
      expect(slide.speakerNotes).toBeTruthy();
      expect(slide.targetDurationSeconds).toBeGreaterThan(0);
      expect(Array.isArray(slide.keyPoints)).toBe(true);
      expect(slide.keyPoints.length).toBeLessThanOrEqual(6);
    }

    // Verify embedded slideDeck representation
    expect(res.body.deck).toBeDefined();
    expect(res.body.deck.title).toBe(res.body.deckTitle);
    expect(Array.isArray(res.body.deck.slides)).toBe(true);
  });

  it("POST /generate-deck 404s on nonexistent project (IDOR protection)", async () => {
    const res = await request(app)
      .post("/api/projects/proj-ghost/presentation/generate-deck")
      .send({ title: "Ghost Deck" });

    expect(res.status).toBe(404);
  });

  it("POST /qa-simulate returns structured referee scenarios with difficulty levels and rebuttal points", async () => {
    const projectId = await createPresentationProject();

    const res = await request(app)
      .post(`/api/projects/${projectId}/presentation/qa-simulate`)
      .send({
        title: "Quantum Cognitive Paradigms in Autonomous Systems",
        audienceFocus: "Peer-Review Referees & Oral Committee",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.qaScenarios)).toBe(true);
    expect(res.body.qaScenarios.length).toBeGreaterThanOrEqual(2);

    for (const qa of res.body.qaScenarios) {
      expect(qa.questionId).toBeTruthy();
      expect(qa.audienceType).toBeTruthy();
      expect(["moderate", "rigorous", "adversarial"]).toContain(qa.difficultyLevel);
      expect(qa.questionText).toBeTruthy();
      expect(qa.probingIntent).toBeTruthy();
      expect(qa.suggestedAnswer).toBeTruthy();
      expect(Array.isArray(qa.modelRebuttalStructure)).toBe(true);
      expect(qa.modelRebuttalStructure.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("POST /qa-simulate 404s on nonexistent project", async () => {
    const res = await request(app)
      .post("/api/projects/proj-ghost/presentation/qa-simulate")
      .send({ title: "Ghost Q&A" });

    expect(res.status).toBe(404);
  });

  it("GET /deck and PUT /deck persist and retrieve slide deck with version tracking", async () => {
    const projectId = await createPresentationProject();

    // Initial GET returns starter deck
    const getRes = await request(app).get(`/api/projects/${projectId}/presentation/deck`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.success).toBe(true);
    expect(getRes.body.deck).toBeDefined();

    // PUT updates deck
    const updatedDeck = {
      ...getRes.body.deck,
      title: "Updated Empirical Slide Deck",
      themeId: "editorial-warm",
    };

    const putRes = await request(app)
      .put(`/api/projects/${projectId}/presentation/deck`)
      .send({ deck: updatedDeck });

    expect(putRes.status).toBe(200);
    expect(putRes.body.success).toBe(true);
    expect(putRes.body.deck.title).toBe("Updated Empirical Slide Deck");
    expect(putRes.body.version).toBeGreaterThan(0);

    // Verify persistent retrieval
    const verifyRes = await request(app).get(`/api/projects/${projectId}/presentation/deck`);
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.deck.title).toBe("Updated Empirical Slide Deck");
  });
});
