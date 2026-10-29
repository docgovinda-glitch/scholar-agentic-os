import { test, expect, type Page, type Browser } from "@playwright/test";
import { AUTH_FILES } from "./authFiles";

// Signed-in flows against a local Supabase (see e2e/README.md). Skipped when
// the E2E test accounts are not configured.
const A = { email: process.env.E2E_A_EMAIL, password: process.env.E2E_A_PASSWORD };
const B = { email: process.env.E2E_B_EMAIL, password: process.env.E2E_B_PASSWORD };
test.skip(!A.email || !A.password || !B.email || !B.password, "E2E_A_*/E2E_B_* test accounts not configured");

/** Calls the API with the signed-in user's own Supabase session token. */
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

async function newSession(browser: Browser, file: string) {
  const context = await browser.newContext({ storageState: file });
  const page = await context.newPage();
  await page.goto("/projects");
  return { context, page };
}

// Every test runs as account A (session saved by auth.setup.ts).
test.use({ storageState: AUTH_FILES.A });
test.beforeEach(async ({ page }) => {
  await page.goto("/projects");
  await expect(page.getByText(A.email!).first()).toBeVisible();
});

test("creates a project, sees it listed, and it persists after reload", async ({ page }) => {
  const title = `E2E project ${Date.now()}`;
  const created = await api(page, "POST", "/api/projects", { outputTypeId: "OT-01" });
  expect(created.status).toBe(201);
  const id = created.json.projectId ?? created.json.id;
  expect((await api(page, "PATCH", `/api/projects/${id}`, { title })).status).toBe(200);

  await page.goto("/projects");
  await expect(page.getByText(title).first()).toBeVisible();
  await page.reload();
  await expect(page.getByText(title).first()).toBeVisible();

  await api(page, "DELETE", `/api/projects/${id}`);
});

test("another user cannot see or open the project", async ({ page, browser }) => {
  const title = `E2E private ${Date.now()}`;
  const created = await api(page, "POST", "/api/projects", { outputTypeId: "OT-01" });
  const id = created.json.projectId ?? created.json.id;
  await api(page, "PATCH", `/api/projects/${id}`, { title });

  const other = await newSession(browser, AUTH_FILES.B);
  expect((await api(other.page, "GET", `/api/projects/${id}`)).status).toBe(404);
  await other.page.goto("/projects");
  await expect(other.page.getByText(title)).toHaveCount(0);
  await other.page.goto(`/projects/${id}`);
  await expect(other.page.getByText(title)).toHaveCount(0);
  await other.context.close();

  await api(page, "DELETE", `/api/projects/${id}`);
});

test("a saved presentation deck reloads, and another user cannot read it", async ({ page, browser }) => {
  const c = await api(page, "POST", "/api/presentations", { title: "E2E deck", slides: [{ id: "s1", headline: "Persisted headline" }] });
  expect([200, 201]).toContain(c.status);
  const deckId = c.json.deck?.id ?? c.json.id;
  const g = await api(page, "GET", `/api/presentations/${deckId}`);
  expect(JSON.stringify(g.json)).toContain("Persisted headline");

  const other = await newSession(browser, AUTH_FILES.B);
  expect((await api(other.page, "GET", `/api/presentations/${deckId}`)).status).toBe(404);
  expect((await api(other.page, "PUT", `/api/presentations/${deckId}`, { title: "hijacked" })).status).toBe(404);
  await other.context.close();

  await api(page, "DELETE", `/api/presentations/${deckId}`);
});

test("signing out ends the session", async ({ browser }) => {
  // Separate context so signing out doesn't affect other tests' saved session.
  const { context, page } = await newSession(browser, AUTH_FILES.A);
  await expect(page.getByText(A.email!).first()).toBeVisible();
  await page.getByText(A.email!).first().click(); // account menu
  await page.getByRole("button", { name: /^Sign Out$/i }).first().click();
  await page.getByRole("button", { name: /^Sign Out$/i }).last().click(); // confirm dialog
  await expect(page.getByText(A.email!)).toHaveCount(0);
  expect((await api(page, "GET", "/api/projects")).status).toBe(401);
  await context.close();
});
