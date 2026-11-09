import { test, expect, type Page } from "@playwright/test";
import { AUTH_FILES } from "./authFiles";

// B5: each workspace opens for its owner, keeps what was saved across a
// reload, shows no sample/demo data, and stays private. Runs against the
// local Supabase in CI (see e2e/README.md); no AI provider is configured there.
const A = { email: process.env.E2E_A_EMAIL, password: process.env.E2E_A_PASSWORD };
const B = { email: process.env.E2E_B_EMAIL, password: process.env.E2E_B_PASSWORD };
test.skip(!A.email || !A.password || !B.email || !B.password, "E2E_A_*/E2E_B_* test accounts not configured");

const WORKSPACES = [
  { name: "Coursework", outputTypeId: "OT-01" },
  { name: "Thesis", outputTypeId: "OT-07" },
  { name: "Journal", outputTypeId: "OT-10" },
  { name: "Proposal", outputTypeId: "OT-15" },
] as const;

// Text that only ever came from demo content, removed in P0-1…P0-19.
const DEMO_MARKERS = [
  /Aaditya|aaditya@scholar\.io/,
  /MN6094NI Developing Breakthrough Leadership/,
  /Nature Machine Intelligence/,
  /Vaswani, A\. et al\./,
  /p < 0\.001/,
  /Top 8th Percentile/,
];

async function api(page: Page, method: string, path: string, body?: unknown) {
  return page.evaluate(
    async ({ method, path, body }) => {
      const key = Object.keys(localStorage).find((k) => k.startsWith("sb-") && k.endsWith("-auth-token"));
      const token = key ? JSON.parse(localStorage.getItem(key) || "{}").access_token : undefined;
      const res = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: res.status, json: await res.json().catch(() => null) };
    },
    { method, path, body }
  );
}

test.use({ storageState: AUTH_FILES.A });

for (const ws of WORKSPACES) {
  test(`${ws.name} (${ws.outputTypeId}) opens, keeps saved answers, shows no demo data, stays private`, async ({ page, browser }) => {
    await page.goto("/projects");
    await expect(page.getByText(A.email!).first()).toBeVisible();

    const created = await api(page, "POST", "/api/projects", { outputTypeId: ws.outputTypeId });
    expect(created.status).toBe(201);
    const id: string = created.json.projectId ?? created.json.id;

    try {
      // Save intake answers, then read them back after a fresh load.
      const marker = `E2E ${ws.name} ${Date.now()}`;
      const saved = await api(page, "PATCH", `/api/projects/${id}/intake`, { answers: { title: marker, e2e_note: "kept" } });
      expect(saved.status).toBe(200);
      await page.reload();
      const reread = await api(page, "GET", `/api/projects/${id}`);
      expect(reread.status).toBe(200);
      expect(reread.json.answers).toMatchObject({ title: marker, e2e_note: "kept" });

      // The workspace renders without crashing and shows no demo content.
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(`/projects/${id}`);
      await page.waitForLoadState("networkidle");
      await expect(page.getByText("View call stack trace")).toHaveCount(0);
      const text = await page.locator("body").innerText();
      expect(text.trim().length).toBeGreaterThan(50);
      for (const re of DEMO_MARKERS) expect(text, `demo text ${re} in ${ws.name}`).not.toMatch(re);
      expect(errors, `uncaught errors in ${ws.name}`).toEqual([]);

      // Another user cannot read it.
      const other = await browser.newContext({ storageState: AUTH_FILES.B });
      const otherPage = await other.newPage();
      await otherPage.goto("/projects");
      const peek = await api(otherPage, "GET", `/api/projects/${id}`);
      expect(peek.status).toBe(404);
      await other.close();
    } finally {
      await api(page, "DELETE", `/api/projects/${id}`);
    }
  });
}
