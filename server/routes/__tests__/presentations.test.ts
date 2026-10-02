import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
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

  it("POST /api/presentations/:id/copilot mutates slide to 2-column comparative layout", async () => {
    const copilotRes = await request(app)
      .post("/api/presentations/deck-test-1/copilot")
      .send({
        slideIndex: 0,
        prompt: "Make this slide a 2-column comparative case study",
      });

    expect(copilotRes.status).toBe(200);
    expect(copilotRes.body.success).toBe(true);
    expect(copilotRes.body.mutatedSlide.layoutType).toBe("two-column");
    expect(copilotRes.body.mutatedSlide.blocks.some((b: any) => b.type === "two-column")).toBe(true);
  });

  it("POST /api/presentations/:id/copilot mutates slide to big metric focus", async () => {
    const copilotRes = await request(app)
      .post("/api/presentations/deck-test-1/copilot")
      .send({
        slideIndex: 0,
        prompt: "Convert bullets to a 4.2x metric callout",
      });

    expect(copilotRes.status).toBe(200);
    expect(copilotRes.body.success).toBe(true);
    expect(copilotRes.body.mutatedSlide.layoutType).toBe("metric-focus");
    expect(copilotRes.body.mutatedSlide.blocks.some((b: any) => b.type === "metric-callout")).toBe(true);
  });

  it("DELETE /api/presentations/:id removes presentation deck", async () => {
    const delRes = await request(app).delete("/api/presentations/deck-test-1");
    expect(delRes.status).toBe(200);
    expect(delRes.body.success).toBe(true);

    const getRes = await request(app).get("/api/presentations/deck-test-1");
    expect(getRes.status).toBe(404);
  });
});
