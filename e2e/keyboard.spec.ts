import { test, expect, type Page } from "@playwright/test";
import { AUTH_FILES } from "./authFiles";

// B7: every control reached with Tab shows a visible focus indicator, and Tab
// keeps moving (no traps). Signed-out pages run without the E2E accounts.
const A = { email: process.env.E2E_A_EMAIL, password: process.env.E2E_A_PASSWORD };
const TABS = 30;

async function tabThrough(page: Page) {
  const problems: string[] = [];
  const seen = new Set<string>();
  let stuck = 0;
  let last = "";
  for (let i = 0; i < TABS; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const s = getComputedStyle(el);
      const outline = s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0;
      const ring = s.boxShadow && s.boxShadow !== "none";
      const r = el.getBoundingClientRect();
      const label = (el.getAttribute("aria-label") || el.textContent || el.getAttribute("placeholder") || "").trim().slice(0, 40);
      const id = `${el.tagName.toLowerCase()}#${el.id}.${String(el.className).split(" ").slice(0, 4).join(".")}|${label}`;
      return { id, visible: Boolean(outline || ring), onScreen: r.width > 0 && r.height > 0 };
    });
    if (!info) continue;
    if (info.id === last) stuck++;
    else stuck = 0;
    last = info.id;
    if (stuck >= 3) {
      problems.push(`focus stuck on ${info.id}`);
      break;
    }
    if (seen.has(info.id)) continue;
    seen.add(info.id);
    if (info.onScreen && !info.visible) problems.push(`no visible focus: ${info.id}`);
  }
  return { problems, reached: seen.size };
}

for (const route of ["/", "/signin", "/presentation"]) {
  test(`${route}: Tab moves through controls with a visible focus ring`, async ({ page }) => {
    await page.goto(route);
    await page.waitForLoadState("networkidle");
    const { problems, reached } = await tabThrough(page);
    expect(reached, "Tab reached some controls").toBeGreaterThan(2);
    expect(problems).toEqual([]);
  });
}

test.describe("signed in", () => {
  test.skip(!A.email || !A.password, "E2E_A_* test account not configured");
  test.use({ storageState: AUTH_FILES.A });

  for (const route of ["/projects", "/vault", "/ai-access"]) {
    test(`${route}: Tab moves through controls with a visible focus ring`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      const { problems, reached } = await tabThrough(page);
      expect(reached, "Tab reached some controls").toBeGreaterThan(2);
      expect(problems).toEqual([]);
    });
  }
});
