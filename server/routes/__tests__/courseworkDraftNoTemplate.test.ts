/**
 * P0-20: Coursework section drafting returns the AI's text or an honest
 * failure, never template prose.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { countProseWords } from "../../../src/shared/proseBlocks";

const TEST_USER_ID = "33333333-3333-4333-8333-333333333333";
vi.mock("../../src/middleware/auth.ts", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: TEST_USER_ID, email: "coursework.draft@example.test" };
    next();
  },
}));

vi.mock("../../utils/llm.ts", () => ({
  callOpenRouterJSON: vi.fn(),
  callOpenRouterText: vi.fn(),
  handOffBeforeStream: vi.fn(async () => false),
  getCandidates: () => [],
  buildAuthorizedPolicy: () => ({}),
  resolveRequestAiConfig: () => ({ candidates: [], isClientConfigured: false }),
}));

import request from "supertest";
import { app } from "../../../server.ts";
import { __resetProjectStoreForTests } from "../../../src/app/conductor/projectStore.ts";
import { getProjectStore } from "../../../src/services/store/projectStore.ts";
import { callOpenRouterText, handOffBeforeStream } from "../../utils/llm.ts";

process.env.SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_coursework_test";

// Phrases only the old template generator wrote.
const TEMPLATE_MARKERS = [/supplementary elaboration/i, /Zappos/i, /Schein/i];

async function createProject(): Promise<string> {
  const project = {
    projectId: "proj-coursework-draft-no-template",
    ownerId: TEST_USER_ID,
    schemaVersion: 1,
    outputTypeId: "OT-01",
    answers: { assignment_question: "Discuss group work in organisations.", assignment_type: "essay" },
    gates: [],
    manuscriptJob: null,
    peerReviewHistory: { rounds: [] },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await getProjectStore().save(project as any);
  return project.projectId;
}

type StreamOpts = { onToken?: (t: string) => void; onReset?: () => void; signal?: AbortSignal };

/** The model answering `text`, token by token, as the router streams it. */
const streams = (text: string) => async (..._args: unknown[]) => {
  const stream = (_args[6] ?? {}) as StreamOpts;
  for (const token of text.split(/(\s+)/).filter(Boolean)) stream.onToken?.(token);
  return text;
};

const eventsOf = (body: string) =>
  body
    .split("\n\n")
    .filter((l) => l.startsWith("data: {"))
    .map((l) => JSON.parse(l.slice(6)) as { chunk?: string; replace?: string; fullText?: string; error?: string });

/** What callOpenRouterText does when there is no AI: send the 426 hand-off and throw. */
function handOffToBrowser() {
  vi.mocked(callOpenRouterText).mockImplementation(async (_req: any, res: any) => {
    if (!res.headersSent) res.status(426).json({ requireFrontendLLM: true, challengeToken: "t", systemPrompt: "s", userPrompt: "u" });
    throw new Error("RequireFrontendLLMException");
  });
}

beforeEach(() => {
  __resetProjectStoreForTests();
  vi.clearAllMocks();
  vi.mocked(handOffBeforeStream).mockResolvedValue(false);
});

describe("Coursework stream-section", () => {
  it("returns the AI's text as an event stream", async () => {
    const id = await createProject();
    vi.mocked(callOpenRouterText).mockResolvedValue("Group work shapes how teams decide.");
    const res = await request(app).post(`/api/projects/${id}/assignment/stream-section`).send({ sectionTitle: "Introduction" });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");
    expect(res.text).toContain("Group work shapes how teams decide.");
  });

  it("when every provider is out of credit, streams a labelled offline scaffold instead of dropping the request", async () => {
    const id = await createProject();
    vi.mocked(callOpenRouterText).mockRejectedValue(new Error("This account has no remaining credit or quota with the provider."));
    const res = await request(app)
      .post(`/api/projects/${id}/assignment/stream-section`)
      .send({ sectionTitle: "2.0 Group decisions", guidance: "Explain how groups decide.", keyPoints: ["Consensus versus majority"], allocatedWords: 300 });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");
    expect(res.text).toContain("offline_scaffold");
    expect(res.text).toContain("Offline scaffold");
    expect(res.text).toContain("Consensus versus majority");
    for (const marker of TEMPLATE_MARKERS) expect(res.text).not.toMatch(marker);
  });

  it("never replaces existing text with a scaffold when a revision fails", async () => {
    const id = await createProject();
    vi.mocked(callOpenRouterText).mockRejectedValue(new Error("quota exhausted"));
    const res = await request(app)
      .post(`/api/projects/${id}/assignment/stream-section`)
      .send({ sectionTitle: "Intro", revisionPrompt: "expand", existingContent: "My own words." });
    expect(res.status).toBe(200);
    expect(res.text).toContain('"recoverable":true');
    expect(res.text).not.toContain("fullText");
    expect(res.text).not.toContain("Offline scaffold");
  });

  it("without the user's AI, hands off with a 426 before the stream opens", async () => {
    const id = await createProject();
    vi.mocked(handOffBeforeStream).mockImplementation(async (_req: any, res: any) => {
      res.status(426).json({ requireFrontendLLM: true, challengeToken: "t", systemPrompt: "s", userPrompt: "u" });
      return true;
    });
    const res = await request(app).post(`/api/projects/${id}/assignment/stream-section`).send({ sectionTitle: "Introduction" });
    expect(res.status).toBe(426);
    expect(res.body.requireFrontendLLM).toBe(true);
    expect(callOpenRouterText).not.toHaveBeenCalled();
    for (const re of TEMPLATE_MARKERS) expect(res.text).not.toMatch(re);
  });

  it("a late hand-off after the stream opened is a recoverable error event", async () => {
    const id = await createProject();
    handOffToBrowser();
    const res = await request(app).post(`/api/projects/${id}/assignment/stream-section`).send({ sectionTitle: "Introduction" });
    expect(res.status).toBe(200);
    expect(res.text).toContain('"recoverable":true');
    expect(res.text).not.toContain("fullText");
  });

  it("an empty AI answer is a recoverable error event with no draft", async () => {
    const id = await createProject();
    vi.mocked(callOpenRouterText).mockResolvedValue("   ");
    const res = await request(app).post(`/api/projects/${id}/assignment/stream-section`).send({ sectionTitle: "Introduction", targetWordCount: 300 });
    expect(res.status).toBe(200);
    expect(res.text).toContain('"recoverable":true');
    expect(res.text).toContain("empty answer");
    expect(res.text).not.toContain("fullText");
  });

  it("flushes SSE headers before the model answers", async () => {
    const id = await createProject();
    vi.mocked(callOpenRouterText).mockResolvedValue("Teams decide together.");
    const res = await request(app).post(`/api/projects/${id}/assignment/stream-section`).send({ sectionTitle: "Introduction" });
    expect(res.headers["cache-control"]).toBe("no-cache, no-transform");
    expect(res.headers["x-accel-buffering"]).toBe("no");
    expect(res.text.startsWith(": connected")).toBe(true);
  });

  it("never writes an [Unverified Claim] tag into the streamed prose", async () => {
    const id = await createProject();
    vi.mocked(callOpenRouterText).mockResolvedValue("Teams decide by consensus [ev-unknown]. Leaders still shape the outcome [1].");
    const res = await request(app)
      .post(`/api/projects/${id}/assignment/stream-section`)
      .send({ sectionTitle: "Introduction", allocatedWords: 50, boundSources: [{ id: "s1", title: "Group decisions", authors: ["Janis, I."], year: 1982 }] });
    expect(res.text).not.toMatch(/Unverified Claim/i);
    // Text shown in place (replace) and the final text carry no raw or unmatched token.
    const shown = eventsOf(res.text).flatMap((e) => [e.replace, e.fullText]).filter((x): x is string => typeof x === "string");
    expect(shown.length).toBeGreaterThan(0);
    for (const t of shown) expect(t).not.toContain("[ev-unknown]");
  });

  it("lands a short draft inside its ±5% budget with one visible continuation, counting words like the app", async () => {
    const id = await createProject();
    const sentence = (topic: string, n: number) => `${Array.from({ length: n - 1 }, (_, i) => `${topic}${i}`).join(" ")} end.`;
    vi.mocked(callOpenRouterText)
      .mockImplementationOnce(streams(sentence("first", 20))) // first draft: 20 words
      .mockImplementationOnce(streams(sentence("second", 30))); // continuation: new text
    const res = await request(app).post(`/api/projects/${id}/assignment/stream-section`).send({ sectionTitle: "Body", allocatedWords: 50 });
    const events = eventsOf(res.text);
    const full = events.find((e) => typeof e.fullText === "string")?.fullText as string;
    const n = countProseWords(full);
    expect(n).toBeGreaterThanOrEqual(47);
    expect(n).toBeLessThanOrEqual(53);
    expect(full).toMatch(/first0[\s\S]*\n\nsecond0/);
    // The continuation was streamed after the first draft, not swapped in silently.
    const order = events.map((e) => (e.chunk?.startsWith("first0") ? "first" : e.chunk?.startsWith("second0") ? "second" : e.replace !== undefined ? "replace" : e.fullText ? "final" : "")).filter(Boolean);
    expect(order).toEqual(["first", "replace", "second", "final"]);
    expect(vi.mocked(callOpenRouterText)).toHaveBeenCalledTimes(2);
  });

  it("resumes a stopped draft from where it ended instead of starting again", async () => {
    const id = await createProject();
    const partial = "Groups shape decisions through shared norms. Members anchor on early proposals.";
    vi.mocked(callOpenRouterText).mockImplementationOnce(streams("However, structured dissent widens the options."));
    const res = await request(app).post(`/api/projects/${id}/assignment/stream-section`).send({ sectionTitle: "Body", allocatedWords: 40, continueFrom: partial });
    const prompt = String(vi.mocked(callOpenRouterText).mock.calls[0][3]);
    expect(prompt).toContain("SECTION SO FAR");
    expect(prompt).toContain(partial);
    const events = eventsOf(res.text);
    expect(events[0].replace).toBe(`${partial}\n\n`);
    expect(events.find((e) => e.fullText)?.fullText).toBe(`${partial}\n\nHowever, structured dissent widens the options.`);
  });

  it("offers the model only sources it can cite and never invents author, title or year", async () => {
    const id = await createProject();
    vi.mocked(callOpenRouterText).mockResolvedValue("Teams decide together [s1]. Others disagree [s2].");
    const res = await request(app)
      .post(`/api/projects/${id}/assignment/stream-section`)
      .send({
        sectionTitle: "Body",
        allocatedWords: 50,
        boundSources: [
          { id: "s1", title: "Group decisions", authors: ["Janis, I."], year: 1982 },
          { id: "s2", title: "No authors listed", authors: [], year: 2001 },
          { id: "s3", title: "No year given", authors: ["Somebody, A."] },
          { id: "s4", authors: ["Untitled, B."], year: 2015 },
        ],
      });
    const prompt = String(vi.mocked(callOpenRouterText).mock.calls[0][3]);
    expect(prompt).not.toMatch(/Author\(s\): Author\b|Scholarly Resource|No authors listed|No year given|n\.d\./);
    const full = eventsOf(res.text).find((e) => e.fullText)?.fullText ?? "";
    expect(full).toContain("Janis");
    expect(full).not.toMatch(/\(Author|Scholarly Resource|\[s2\]/);
  });

  it("trims an overrun created by expanding citation tokens", async () => {
    const id = await createProject();
    const body = Array.from({ length: 10 }, (_, i) => `Claim number ${i} holds [1].`).join(" "); // 40 words + 10 tokens
    vi.mocked(callOpenRouterText).mockResolvedValue(`${body} ${body}`);
    const res = await request(app)
      .post(`/api/projects/${id}/assignment/stream-section`)
      .send({ sectionTitle: "Body", allocatedWords: 80, boundSources: [{ id: "s1", title: "Rates", authors: ["Kuncoro, H."], year: 2020 }] });
    const full = res.text.split("\n\n").filter((l) => l.startsWith("data: {")).map((l) => JSON.parse(l.slice(6))).find((e) => typeof e.fullText === "string")?.fullText as string;
    expect(full).toContain("Kuncoro");
    expect(countProseWords(full)).toBeLessThanOrEqual(84);
  });

  it("keeps the blank lines between paragraphs in the streamed chunks and final text", async () => {
    const id = await createProject();
    const p1 = "Groups shape decisions through shared norms. Members anchor on early proposals. This narrows debate quickly.";
    const p2 = "However, structured dissent widens the options. Teams that assign a critic consider more evidence. The result is a better choice.";
    // The draft is short of the 50-word minimum; the continuation adds nothing.
    vi.mocked(callOpenRouterText).mockImplementationOnce(streams(`${p1}\n\n${p2}`)).mockImplementationOnce(streams(""));
    const res = await request(app).post(`/api/projects/${id}/assignment/stream-section`).send({ sectionTitle: "Introduction", allocatedWords: 40 });
    const events = res.text
      .split("\n\n")
      .filter((l) => l.startsWith("data: {"))
      .map((l) => JSON.parse(l.slice(6)));
    const streamed = events.filter((e) => typeof e.chunk === "string").map((e) => e.chunk).join("");
    const full = events.find((e) => typeof e.fullText === "string")?.fullText as string;
    expect(full).toContain("\n\n");
    expect(full.split("\n\n")).toHaveLength(2);
    expect(streamed).toBe(full);
  });

  it("streams the first tokens before the model finishes, and stops the model when the student closes the stream", async () => {
    const id = await createProject();
    let aborted = false;
    let firstTokenSent!: () => void;
    const firstToken = new Promise<void>((r) => (firstTokenSent = r));
    vi.mocked(callOpenRouterText).mockImplementation(async (...args: unknown[]) => {
      const stream = (args[6] ?? {}) as StreamOpts;
      stream.onToken?.("Groups ");
      firstTokenSent();
      // The model keeps going until it is stopped.
      await new Promise<void>((resolve) => stream.signal?.addEventListener("abort", () => resolve(), { once: true }));
      aborted = Boolean(stream.signal?.aborted);
      throw new Error("aborted");
    });
    const server = app.listen(0);
    try {
      const port = (server.address() as { port: number }).port;
      const ctl = new AbortController();
      const res = await fetch(`http://127.0.0.1:${port}/api/projects/${id}/assignment/stream-section`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionTitle: "Introduction", allocatedWords: 100 }),
        signal: ctl.signal,
      });
      const reader = res.body!.getReader();
      let seen = "";
      while (!seen.includes('"chunk":"Groups "')) {
        const { value, done } = await reader.read();
        if (done) break;
        seen += new TextDecoder().decode(value);
      }
      expect(seen).toContain('"chunk":"Groups "');
      await firstToken;
      ctl.abort();
      await vi.waitFor(() => expect(aborted).toBe(true), { timeout: 2000 });
    } finally {
      server.close();
    }
  });
});
