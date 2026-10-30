import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";

export const TEST_USER_ID = "11111111-1111-4111-8111-111111111111";
vi.mock("../../src/middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: TEST_USER_ID, email: "test@example.com" };
    next();
  },
}));

import { registerPresentationRoutes } from "../presentations";

describe("Presentation Studio REST API Routes (/api/presentations)", () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    registerPresentationRoutes(app);
  });

  it("POST /api/presentations creates a new deck and GET /api/presentations lists it", async () => {
    const newDeck = {
      id: "deck-test-1",
      title: "Quantum Verification Architecture",
      topic: "Quantum Computing",
      framework: "Universal-5Beat",
      theme_id: "sand-academic",
      slides: [
        {
          id: "slide-1",
          order: 1,
          actionHeadline: "Quantum Algorithms Achieve Exponential Speedup",
          blocks: [],
          speakerNotes: "Opening remarks on quantum speedup.",
        },
      ],
    };

    const createRes = await request(app)
      .post("/api/presentations")
      .send(newDeck);

    expect(createRes.status).toBe(201);
    expect(createRes.body.success).toBe(true);
    expect(createRes.body.deck.title).toBe("Quantum Verification Architecture");

    const listRes = await request(app).get("/api/presentations");
    expect(listRes.status).toBe(200);
    expect(listRes.body.success).toBe(true);
    expect(listRes.body.decks.some((d: any) => d.id === "deck-test-1")).toBe(true);
  });

  it("GET /api/presentations/:id retrieves single presentation deck", async () => {
    const res = await request(app).get("/api/presentations/deck-test-1");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.deck.id).toBe("deck-test-1");
  });

  it("PUT /api/presentations/:id performs debounced autosave updates", async () => {
    const updateRes = await request(app)
      .put("/api/presentations/deck-test-1")
      .send({
        title: "Updated Quantum Architecture v2",
        theme_id: "deep-charcoal",
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.success).toBe(true);
    expect(updateRes.body.deck.title).toBe("Updated Quantum Architecture v2");
    expect(updateRes.body.deck.theme_id).toBe("deep-charcoal");
  });

  it("POST /api/presentations/:id/copilot refuses a comparison for a slide with no points of its own", async () => {
    const copilotRes = await request(app)
      .post("/api/presentations/deck-test-1/copilot")
      .send({
        slideIndex: 0,
        prompt: "Make this slide a 2-column comparative case study",
      });

    expect(copilotRes.status).toBe(400);
    expect(copilotRes.body.error).toMatch(/at least two points/i);
  });

  it("POST /api/presentations/:id/copilot splits the slide's own points into a 2-column layout", async () => {
    const ownPoints = ["Manual review takes two weeks", "Errors found late", "Automated checks run nightly", "Errors found early"];
    const copilotRes = await request(app)
      .post("/api/presentations/deck-test-1/copilot")
      .send({
        slideIndex: 0,
        prompt: "Make this slide a 2-column comparative case study",
        currentSlide: {
          id: "slide-1",
          order: 1,
          actionHeadline: "Review Process",
          blocks: [{ type: "bullet-list", items: ownPoints }],
        },
      });

    expect(copilotRes.status).toBe(200);
    expect(copilotRes.body.success).toBe(true);
    expect(copilotRes.body.mutatedSlide.layoutType).toBe("two-column");
    const col = copilotRes.body.mutatedSlide.blocks.find((b: any) => b.type === "two-column");
    expect([...col.leftPoints, ...col.rightPoints]).toEqual(ownPoints);
  });

  it("POST /api/presentations/:id/copilot mutates slide to big metric focus using the user's own figure", async () => {
    const copilotRes = await request(app)
      .post("/api/presentations/deck-test-1/copilot")
      .send({
        slideIndex: 0,
        prompt: "Convert bullets to a 4.2x metric callout",
      });

    expect(copilotRes.status).toBe(200);
    expect(copilotRes.body.success).toBe(true);
    expect(copilotRes.body.mutatedSlide.layoutType).toBe("metric-focus");
    const metric = copilotRes.body.mutatedSlide.blocks.find((b: any) => b.type === "metric-callout");
    expect(metric.value).toBe("4.2x");
    // No invented sample size or significance attached to the figure
    expect(JSON.stringify(copilotRes.body.mutatedSlide)).not.toMatch(/p < 0\.001|5,000/);
  });

  it("POST /api/presentations/:id/copilot refuses a metric callout without a figure", async () => {
    const copilotRes = await request(app)
      .post("/api/presentations/deck-test-1/copilot")
      .send({ slideIndex: 0, prompt: "Turn this into a metric callout" });

    expect(copilotRes.status).toBe(400);
    expect(copilotRes.body.error).toMatch(/never invents a number/i);
  });

  it("DELETE /api/presentations/:id removes presentation deck", async () => {
    const delRes = await request(app).delete("/api/presentations/deck-test-1");
    expect(delRes.status).toBe(200);
    expect(delRes.body.success).toBe(true);

    const getRes = await request(app).get("/api/presentations/deck-test-1");
    expect(getRes.status).toBe(404);
  });
});
