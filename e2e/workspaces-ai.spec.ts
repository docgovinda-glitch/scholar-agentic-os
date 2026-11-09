import { test, expect, type Page } from "@playwright/test";
import { AUTH_FILES } from "./authFiles";

// B5: the drafting step of each workspace runs through the app's real
// server-side AI path and keeps what it wrote. The AI is the CI stand-in
// (e2e/stub-ai/server.mjs) on LM Studio's default address, selected per
// request with the same x-ai-* headers the app sends for a user's own AI.
const A = { email: process.env.E2E_A_EMAIL, password: process.env.E2E_A_PASSWORD };
const STUB_AI_URL = process.env.E2E_STUB_AI_URL; // e.g. http://localhost:1234
test.skip(!A.email || !A.password, "E2E_A_* test account not configured");
test.skip(!STUB_AI_URL, "E2E_STUB_AI_URL not set (start e2e/stub-ai/server.mjs)");

const MARKER = "E2E-STUB-DRAFT";
const AI_HEADERS = { "x-ai-provider": "lmstudio", "x-ai-model": "e2e-stub" };

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

test("without the user's AI, drafting asks for it instead of inventing text", async ({ page }) => {
  await withProject(page, "OT-01", { title: "E2E no-AI coursework" }, async (id) => {
    const before = await stubCalls();
    const res = await api(page, "POST", `/api/projects/${id}/assignment/draft-section`, { sectionTitle: "Introduction" });
    expect(res.status).toBe(426);
    expect(res.json?.requireFrontendLLM).toBe(true);
    expect(res.text).not.toContain(MARKER);
    expect(await stubCalls()).toBe(before);
  });
});

test("Coursework (OT-01): a section is drafted by the user's AI", async ({ page }) => {
  await withProject(page, "OT-01", { title: "E2E coursework", assignment_question: "Discuss group work." }, async (id) => {
    const before = await stubCalls();
    const res = await api(page, "POST", `/api/projects/${id}/assignment/draft-section`, { sectionTitle: "Introduction", targetWordCount: 150 }, AI_HEADERS);
    expect(res.status, res.text.slice(0, 300)).toBe(200);
    expect(res.json?.draft).toContain(MARKER);
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

test("Proposal (OT-15): a section is drafted by the user's AI", async ({ page }) => {
  await withProject(page, "OT-15", { title: "E2E proposal" }, async (id) => {
    const res = await api(page, "POST", `/api/projects/${id}/proposal/draft-section`, { sectionTitle: "Specific Aims", targetWords: 150 }, AI_HEADERS);
    expect(res.status, res.text.slice(0, 300)).toBe(200);
    expect(res.json?.content).toContain(MARKER);
  });
});

test("Journal (OT-10): the manuscript draft is written by the user's AI and kept after a reload", async ({ page }) => {
  await withProject(page, "OT-10", { title: "E2E journal" }, async (id) => {
    const res = await api(page, "POST", `/api/projects/${id}/agentic/draft`, {}, AI_HEADERS);
    expect(res.status, res.text.slice(0, 300)).toBe(200);
    expect(res.text).toContain("event: done");
    expect(res.text).not.toContain("event: error");
    expect(res.text).toContain(MARKER);

    await page.reload();
    const reread = await api(page, "GET", `/api/projects/${id}`);
    expect(reread.status).toBe(200);
    expect(String(reread.json?.answers?.manuscript_draft ?? "")).toContain(MARKER);
  });
});

// Server-side tables (manuscript_versions) have no client policies; the test
// reads them with the LOCAL stack's service role, never production.
const LOCAL_SUPABASE_URL = process.env.E2E_SUPABASE_URL;
const LOCAL_SERVICE_ROLE = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;

async function serviceSelect(table: string, filter: string): Promise<Array<Record<string, unknown>>> {
  const res = await fetch(`${LOCAL_SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    headers: { apikey: LOCAL_SERVICE_ROLE!, Authorization: `Bearer ${LOCAL_SERVICE_ROLE}` },
  });
  expect(res.status).toBe(200);
  return (await res.json()) as Array<Record<string, unknown>>;
}

test("Journal (OT-10): drafting again keeps the previous draft as a version", async ({ page }) => {
  test.skip(!LOCAL_SUPABASE_URL || !LOCAL_SERVICE_ROLE, "E2E_SUPABASE_URL / E2E_SUPABASE_SERVICE_ROLE_KEY not set");
  await withProject(page, "OT-10", { title: "E2E journal versions" }, async (id) => {
    for (const round of [1, 2]) {
      const res = await api(page, "POST", `/api/projects/${id}/agentic/draft`, {}, AI_HEADERS);
      expect(res.status, `round ${round}: ${res.text.slice(0, 300)}`).toBe(200);
      expect(res.text, `round ${round}`).toContain("event: done");
      expect(res.text, `round ${round}: ${res.text.slice(-400)}`).not.toContain("event: error");
    }
    const sections = await serviceSelect("manuscript_sections", `project_id=eq.${id}&select=section_name,content`);
    expect(sections).toHaveLength(1);
    expect(String(sections[0].content)).toContain(MARKER);
    const versions = await serviceSelect("manuscript_versions", `project_id=eq.${id}&select=section_name,content`);
    expect(versions.length).toBeGreaterThanOrEqual(1);
    expect(String(versions[0].content)).toContain(MARKER);
  });
});

test("Journal (OT-10): the drafted manuscript exports to Markdown and Word, for its owner only", async ({ page, browser }) => {
  await withProject(page, "OT-10", { title: "E2E journal export" }, async (id) => {
    // Nothing drafted yet: export says so instead of producing an empty file.
    const empty = await api(page, "POST", `/api/projects/${id}/export/markdown`, {});
    expect(empty.status).toBe(400);

    const drafted = await api(page, "POST", `/api/projects/${id}/agentic/draft`, {}, AI_HEADERS);
    expect(drafted.status).toBe(200);

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
