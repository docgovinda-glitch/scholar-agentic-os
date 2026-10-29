import { test as setup, expect, type Page } from "@playwright/test";

// Signs each E2E account in once through the real sign-in form and saves the
// session, so specs don't hit the login rate limit (5 per 5 min per IP).
import { AUTH_FILES } from "./authFiles";
const accounts = {
  A: { email: process.env.E2E_A_EMAIL, password: process.env.E2E_A_PASSWORD },
  B: { email: process.env.E2E_B_EMAIL, password: process.env.E2E_B_PASSWORD },
};

async function signIn(page: Page, who: { email?: string; password?: string }) {
  await page.goto("/signin");
  await page.locator("#username").fill(who.email!);
  await page.locator("#password").fill(who.password!);
  await page.getByRole("button", { name: /^Sign in$/ }).click();
  // First sign-in offers optional AI Access and Knowledge Vault setup: skip both.
  for (let i = 0; i < 3; i++) {
    const skip = page.getByRole("button", { name: /^(Skip( for now)?|Not now)$/i }).first();
    try {
      await skip.waitFor({ state: "visible", timeout: 5000 });
      await skip.click();
    } catch {
      break;
    }
  }
  await expect(page.getByText(who.email!).first()).toBeVisible();
}

for (const key of ["A", "B"] as const) {
  setup(`sign in test account ${key}`, async ({ page }) => {
    setup.skip(!accounts[key].email || !accounts[key].password, "E2E accounts not configured");
    await signIn(page, accounts[key]);
    await page.context().storageState({ path: AUTH_FILES[key] });
  });
}
