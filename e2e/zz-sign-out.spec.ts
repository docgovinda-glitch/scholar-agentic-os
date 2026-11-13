import { test, expect, type Page, type Browser } from "@playwright/test";
import { AUTH_FILES } from "./authFiles";

// Runs LAST as its own Playwright project ("sign-out", which depends on every other
// project): signing out revokes every session of account A, including the saved
// session the other signed-in specs (signed-in, workspaces) use.
const A = { email: process.env.E2E_A_EMAIL, password: process.env.E2E_A_PASSWORD };
test.skip(!A.email || !A.password, "E2E_A_* test account not configured");

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
