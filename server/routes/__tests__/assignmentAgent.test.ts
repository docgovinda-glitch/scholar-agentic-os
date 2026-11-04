/**
 * The coursework agent's steps run the student's AI on what earlier steps
 * saved, keep only what can be checked against the brief, abstracts or
 * draft, save each result on the project, and refuse to run out of order.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

export const TEST_USER_ID = "44444444-4444-4444-8444-444444444444";
vi.mock("../../src/middleware/auth.ts", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: TEST_USER_ID, email: "agent.tester@university.ac.uk" };
    next();
  },
}));
const routedCompletion = vi.fn();
vi.mock("../../src/ai/routerBridge.ts", async (orig) => ({
  ...(await orig<typeof import("../../src/ai/routerBridge.ts")>()),
  routedCompletion: (...a: unknown[]) => routedCompletion(...a),
}));

import request from "supertest";
import { app } from "../../../server.ts";
import { __resetProjectStoreForTests } from "../../../src/app/conductor/projectStore.ts";
import { getProjectStore } from "../../../src/services/store/projectStore.ts";

const BRIEF =
  "MSc Marketing. Assessment 1 (60%): Write a 2,500-word report evaluating how a UK retailer of your choice uses social media to build customer engagement. Use at least 8 academic sources and Harvard referencing. Marking criteria: critical analysis 40%, use of theory 25%.";
const ID = "proj-agent-1";

async function project(extra: Record<string, unknown> = {}) {
  await getProjectStore().save({
    projectId: ID,
    ownerId: TEST_USER_ID,
    schemaVersion: 1,
    outputTypeId: "OT-01",
    answers: { assignment_question: BRIEF, assignment_brief_text: BRIEF, ...extra },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as any);
}
const saved = async () => (await getProjectStore().get(ID))!.answers;
const post = (path: string, body: object = {}) => request(app).post(`/api/projects/${ID}/assignment/agent/${path}`).send(body);

beforeEach(() => {
  __resetProjectStoreForTests();
  routedCompletion.mockReset();
});

describe("coursework agent", () => {
  it("Extract keeps only what the brief says, fills unset settings, and reads uploaded materials", async () => {
    await project({
      assignment_user_uploaded_sources: JSON.stringify([{ id: "u1", name: "week3.pdf", extractedText: "Week 3 slides. Students should apply the PESTLE model to a real company." }]),
    });
    routedCompletion.mockResolvedValue(
      JSON.stringify({
        task: "A 2,500-word report on a UK retailer's social media engagement.",
        requirements: [
          { text: "At least 8 academic sources", quote: "Use at least 8 academic sources", kind: "referencing" },
          { text: "Apply PESTLE", quote: "Students should apply the PESTLE model", kind: "content" },
          { text: "Invented", quote: "Include a 300-word executive summary", kind: "format" },
        ],
        constraints: { wordCount: 2500, citationStyle: "Harvard" },
        criteria: [{ criterion: "Critical analysis", weight: 40, quote: "critical analysis 40%" }],
        missing: [{ question: "Which retailer will you choose?", why: "The brief leaves it open." }],
      })
    );
    const res = await post("extract");
    expect(res.status).toBe(200);
    expect(res.body.extraction.requirements.map((r: any) => r.text)).toEqual(["At least 8 academic sources", "Apply PESTLE"]);
    expect(routedCompletion.mock.calls[0][1].userPrompt).toMatch(/Material "week3.pdf"/);
    const a = await saved();
    expect(JSON.parse(String(a.assignment_extraction)).missing[0].question).toMatch(/Which retailer/);
    expect(a.targetWordCount).toBe("2500");
    expect(a.citation_style).toBe("Harvard");
  });

  it("Understand needs Extract first, then plans and writes the outline from that plan", async () => {
    await project();
    expect((await post("understand")).status).toBe(400);
    await project({
      targetWordCount: "2500",
      assignment_extraction: JSON.stringify({ task: "A report", questions: [], requirements: [{ text: "8 sources", quote: "x", kind: "referencing" }], objectives: [], constraints: {}, criteria: [], materials: [], missing: [] }),
    });
    routedCompletion
      .mockResolvedValueOnce(JSON.stringify({ discipline: "Marketing", produce: "A consultancy-style report", approach: "Case analysis of Tesco", structure: "Intro, analysis, recommendations", searchQueries: ["social media customer engagement retail"], knowledgeGaps: ["Engagement metrics"] }))
      .mockResolvedValueOnce(JSON.stringify({ sections: [{ title: "Introduction", subsections: [{ title: "Purpose", words: 300 }] }, { title: "Analysis", subsections: [{ title: "Engagement", words: 2200 }] }] }));
    const res = await post("understand");
    expect(res.status).toBe(200);
    expect(res.body.understanding.searchQueries).toEqual(["social media customer engagement retail"]);
    expect(res.body.structure.source).toBe("ai");
    expect(routedCompletion.mock.calls[1][1].userPrompt).toMatch(/Plan for this assignment[\s\S]*Case analysis of Tesco/);
    const a = await saved();
    expect(JSON.parse(String(a.assignment_understanding)).produce).toMatch(/consultancy/);
    expect(JSON.parse(String(a.assignment_structure)).headings).toHaveLength(2);
  });

  it("Sources analyses only the real results it was given, with evidence quoted from abstracts", async () => {
    await project({
      assignment_structure: JSON.stringify({ headings: [{ subheadings: [{ id: "ai-2-1", numberStr: "2.1", title: "Engagement" }] }] }),
    });
    routedCompletion.mockResolvedValue(
      JSON.stringify({
        sources: [
          { id: "W1", relevance: "high", credibility: "Peer-reviewed", mainPoint: "Interactive posts engage more.", evidence: [{ claim: "c", quote: "interactive posts increase engagement" }, { claim: "x", quote: "engagement tripled everywhere" }], sections: ["ai-2-1"] },
          { id: "invented", relevance: "high" },
        ],
      })
    );
    expect((await post("sources", { sources: [] })).status).toBe(400);
    const res = await post("sources", { sources: [{ id: "W1", title: "Social media in retail", abstract: "We show interactive posts increase engagement with UK shoppers.", year: "2023" }] });
    expect(res.status).toBe(200);
    expect(res.body.analyses).toHaveLength(1);
    expect(res.body.analyses[0].evidence).toHaveLength(1);
    expect(JSON.parse(String((await saved()).assignment_source_analysis)).W1.relevance).toBe("high");
  });

  it("Review needs a draft, and keeps only findings that quote it", async () => {
    await project();
    expect((await post("review")).status).toBe(400);
    const text = "Tesco uses Instagram and TikTok to share recipes and run polls with customers. Engagement rose by 40% in 2023 according to company reports. Their is a clear strategy behind the posts that links content to loyalty schemes and in-store offers, which the report evaluates.";
    await project({
      assignment_internal_sections: JSON.stringify([{ id: "s1", title: "1.1 Analysis", draftContent: text }]),
      assignment_extraction: JSON.stringify({ requirements: [{ text: "Evaluate social media use", kind: "content" }], criteria: [] }),
    });
    routedCompletion.mockResolvedValue(
      JSON.stringify({
        summary: "Promising but thin on sources.",
        requirements: [{ index: 1, status: "met", quote: "Tesco uses Instagram and TikTok to share recipes" }],
        unsupportedClaims: [{ quote: "Engagement rose by 40% in 2023", why: "No citation." }, { quote: "Sales doubled", why: "x" }],
        language: [{ quote: "Their is a clear strategy", suggestion: "There is a clear strategy" }],
      })
    );
    const res = await post("review");
    expect(res.status).toBe(200);
    expect(res.body.review.requirements[0].status).toBe("met");
    expect(res.body.review.unsupportedClaims).toHaveLength(1);
    expect(JSON.parse(String((await saved()).assignment_ai_review)).summary).toMatch(/Promising/);
  });

  it("reports an unusable AI answer without saving, and a missing AI as an AI error", async () => {
    await project();
    routedCompletion.mockResolvedValue("Sorry, I cannot help.");
    const res = await post("extract");
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect((await saved()).assignment_extraction).toBeUndefined();
    routedCompletion.mockRejectedValue(Object.assign(new Error("No AI provider is connected"), { name: "NoClientAiProviderError" }));
    expect((await post("extract")).status).toBeGreaterThanOrEqual(400);
  });
});
