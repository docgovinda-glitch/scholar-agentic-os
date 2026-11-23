import { test, expect, type Page } from "@playwright/test";
import { AUTH_FILES } from "./authFiles";

// B5: the drafting step of each workspace runs through the app's real
// server-side AI path and keeps what it wrote. The AI is the CI stand-in
// (e2e/stub-ai/server.mjs) on LM Studio's default address, selected per
// request with the same x-ai-keyring header the app sends for a user's own AI.
const A = { email: process.env.E2E_A_EMAIL, password: process.env.E2E_A_PASSWORD };
const STUB_AI_URL = process.env.E2E_STUB_AI_URL; // e.g. http://localhost:1234
test.skip(!A.email || !A.password, "E2E_A_* test account not configured");
test.skip(!STUB_AI_URL, "E2E_STUB_AI_URL not set (start e2e/stub-ai/server.mjs)");

const MARKER = "E2E-STUB-DRAFT";
const AI_HEADERS = { "x-ai-keyring": Buffer.from(JSON.stringify([{ provider: "lmstudio", model: "e2e-stub" }])).toString("base64url") };

async function api(page: Page, method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}) {
  return page.evaluate(
    async ({ method, path, body, extraHeaders }) => {
      const key = Object.keys(localStorage).find((k) => k.startsWith("sb-") && k.endsWith("-auth-token"));
      const token = key ? JSON.parse(localStorage.getItem(key) || "{}").access_token : undefined;
      const res = await fetch(path, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...extraHeaders,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await res.text();
      let json: unknown = null;
      try { json = JSON.parse(text); } catch { /* event stream or empty */ }
      return { status: res.status, text, json: json as Record<string, any> | null };
    },
    { method, path, body, extraHeaders }
  );
}

async function stubCalls(): Promise<number> {
  const res = await fetch(`${STUB_AI_URL}/__calls`);
  return ((await res.json()) as { calls: number }).calls;
}

async function withProject(page: Page, outputTypeId: string, answers: Record<string, unknown>, run: (id: string) => Promise<void>) {
  await page.goto("/projects");
  await expect(page.getByText(A.email!).first()).toBeVisible();
  const created = await api(page, "POST", "/api/projects", { outputTypeId });
  expect(created.status).toBe(201);
  const id: string = created.json!.projectId ?? created.json!.id;
  try {
    expect((await api(page, "PATCH", `/api/projects/${id}/intake`, { answers })).status).toBe(200);
    await run(id);
  } finally {
    await api(page, "DELETE", `/api/projects/${id}`);
  }
}

test.use({ storageState: AUTH_FILES.A });

test("without the user's AI, the Coursework copilot asks for it instead of sending canned advice", async ({ page }) => {
  await withProject(page, "OT-01", { title: "E2E no-AI coursework", assignment_question: "Discuss group work." }, async (id) => {
    const before = await stubCalls();
    const res = await api(page, "POST", `/api/projects/${id}/assignment/copilot-chat`, { phase: "understand", message: "What do the marking criteria mean?" });
    expect(res.status).toBe(426);
    expect(res.json?.requireFrontendLLM).toBe(true);
    expect(res.text).not.toContain(MARKER);
    expect(await stubCalls()).toBe(before);
  });
});

test("Coursework (OT-01): the copilot answers with the user's AI", async ({ page }) => {
  await withProject(page, "OT-01", { title: "E2E coursework", assignment_question: "Discuss group work." }, async (id) => {
    const before = await stubCalls();
    const res = await api(page, "POST", `/api/projects/${id}/assignment/copilot-chat`, { phase: "drafting", message: "How should I open this section?" }, AI_HEADERS);
    expect(res.status, res.text.slice(0, 300)).toBe(200);
    expect(res.json?.response).toContain(MARKER);
    expect(res.text).not.toMatch(/First Class|Rubric Alignment/);
    expect(await stubCalls()).toBeGreaterThan(before);
  });
});

test("Coursework (OT-01): the Drafting stage's streamed section comes from the user's AI", async ({ page }) => {
  await withProject(page, "OT-01", { title: "E2E coursework stream", assignment_question: "Discuss group work." }, async (id) => {
    const res = await api(page, "POST", `/api/projects/${id}/assignment/stream-section`, { sectionTitle: "Introduction", targetWordCount: 300 }, AI_HEADERS);
    expect(res.status, res.text.slice(0, 300)).toBe(200);
    expect(res.text).toContain(MARKER);
    expect(res.text).not.toMatch(/supplementary elaboration|Zappos|Schein/i);

    // Without the user's AI there is no stream of stand-in text, only the hand-off.
    const noAi = await api(page, "POST", `/api/projects/${id}/assignment/stream-section`, { sectionTitle: "Introduction", targetWordCount: 300 });
    expect(noAi.status).toBe(426);
    expect(noAi.json?.requireFrontendLLM).toBe(true);
  });
});

test("Thesis (OT-07): a chapter is drafted by the user's AI", async ({ page }) => {
  await withProject(page, "OT-07", { title: "E2E thesis" }, async (id) => {
    const res = await api(page, "POST", `/api/projects/${id}/thesis/draft-chapter`, { chapterTitle: "Introduction", targetWords: 150 }, AI_HEADERS);
    expect(res.status, res.text.slice(0, 300)).toBe(200);
    expect(res.json?.content).toContain(MARKER);
  });
});

/**
 * The Journal Writing Studio's flow: one section drafted by the user's AI
 * (POST .../agentic/draft-subsection returns the text and saves nothing),
 * then saved the way the studio saves it (sections + the canonical
 * manuscript_markdown through PATCH .../intake).
 */
async function draftAndSaveIntroduction(page: Page, id: string): Promise<string> {
  const res = await api(
    page,
    "POST",
    `/api/projects/${id}/agentic/draft-subsection`,
    { sectionId: "default-introduction", subSectionId: "default-introduction", subSectionTitle: "Introduction", targetWords: 60, assignedSources: [] },
    AI_HEADERS
  );
  expect(res.status, res.text.slice(0, 300)).toBe(200);
  const content = String(res.json?.content ?? "");
  expect(content).toContain(MARKER);
  const saved = await api(page, "PATCH", `/api/projects/${id}/intake`, {
    answers: {
      manuscript_sections: JSON.stringify({ version: 1, texts: { "default-introduction": content }, unsorted: "" }),
      manuscript_markdown: `## Introduction\n\n${content}\n`,
    },
  });
  expect(saved.status).toBe(200);
  return content;
}

test("Journal (OT-10): a section is drafted by the user's AI, saves nothing by itself, and is kept after a reload once saved", async ({ page }) => {
  await withProject(page, "OT-10", { title: "E2E journal" }, async (id) => {
    const before = await stubCalls();
    const res = await api(
      page,
      "POST",
      `/api/projects/${id}/agentic/draft-subsection`,
      { sectionId: "default-introduction", subSectionId: "default-introduction", subSectionTitle: "Introduction", targetWords: 60, assignedSources: [] },
      AI_HEADERS
    );
    expect(res.status, res.text.slice(0, 300)).toBe(200);
    expect(String(res.json?.content)).toContain(MARKER);
    expect(await stubCalls()).toBeGreaterThan(before);
    // The draft route only returns the text: the studio decides where it goes.
    const untouched = await api(page, "GET", `/api/projects/${id}`);
    expect(String(untouched.json?.answers?.manuscript_markdown ?? "")).not.toContain(MARKER);

    await draftAndSaveIntroduction(page, id);
    await page.reload();
    const reread = await api(page, "GET", `/api/projects/${id}`);
    expect(reread.status).toBe(200);
    expect(String(reread.json?.answers?.manuscript_markdown ?? "")).toContain(MARKER);
  });
});

test("Journal (OT-10): polishing a passage returns it for review and leaves the saved manuscript alone", async ({ page }) => {
  await withProject(page, "OT-10", { title: "E2E journal polish" }, async (id) => {
    await draftAndSaveIntroduction(page, id);
    const before = (await api(page, "GET", `/api/projects/${id}`)).json?.answers?.manuscript_markdown;
    const res = await api(page, "POST", `/api/projects/${id}/agentic/final-editor`, { text: "We delve into the decoder latency." }, AI_HEADERS);
    expect(res.status, res.text.slice(0, 300)).toBe(200);
    expect(res.json?.scope).toBe("passage");
    expect(res.json?.saved).toBe(false);
    expect(typeof res.json?.polishedText).toBe("string");
    const after = (await api(page, "GET", `/api/projects/${id}`)).json?.answers?.manuscript_markdown;
    expect(after).toBe(before);
  });
});

test("Journal (OT-10): the drafted manuscript exports to Markdown and Word, for its owner only", async ({ page, browser }) => {
  await withProject(page, "OT-10", { title: "E2E journal export" }, async (id) => {
    // Nothing drafted yet: export says so instead of producing an empty file.
    const empty = await api(page, "POST", `/api/projects/${id}/export/markdown`, {});
    expect(empty.status).toBe(400);

    await draftAndSaveIntroduction(page, id);

    const md = await api(page, "POST", `/api/projects/${id}/export/markdown`, {});
    expect(md.status, md.text.slice(0, 300)).toBe(200);
    expect(md.text).toContain(MARKER);
    expect(md.text).toContain("Introduction");

    const docx = await page.evaluate(async (path) => {
      const key = Object.keys(localStorage).find((k) => k.startsWith("sb-") && k.endsWith("-auth-token"));
      const token = key ? JSON.parse(localStorage.getItem(key) || "{}").access_token : undefined;
      const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: "{}" });
      const bytes = new Uint8Array(await res.arrayBuffer());
      return { status: res.status, type: res.headers.get("content-type") || "", magic: String.fromCharCode(bytes[0], bytes[1]), size: bytes.length };
    }, `/api/projects/${id}/export/docx`);
    expect(docx.status).toBe(200);
    expect(docx.magic).toBe("PK"); // a .docx is a zip
    expect(docx.size).toBeGreaterThan(1000);

    const other = await browser.newContext({ storageState: AUTH_FILES.B });
    const otherPage = await other.newPage();
    await otherPage.goto("/projects");
    const peek = await api(otherPage, "POST", `/api/projects/${id}/export/markdown`, {});
    expect(peek.status).toBe(404);
    await other.close();
  });
});
