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
      // The indicator may sit on the control or on its container (a borderless
      // field inside a card that rings while it has focus), up to 3 levels up.
      // A container only counts if its outline/shadow changes when focus
      // leaves, so a permanent drop shadow does not pass as a focus ring.
      const look = (node: Element) => {
        const s = getComputedStyle(node);
        const outline = s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0 ? `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}` : "";
        const shadow = s.boxShadow && s.boxShadow !== "none" ? s.boxShadow : "";
        return { outline, shadow };
      };
      const chain: Element[] = [];
      for (let n: Element | null = el, depth = 0; n && depth <= 3; n = n.parentElement, depth++) chain.push(n);
      const focused = chain.map(look);
      el.blur();
      const blurred = chain.map(look);
      el.focus();
      let visibleOn: Element | null = null;
      chain.forEach((n, i) => {
        if (visibleOn) return;
        const f = focused[i];
        const changed = f.outline !== blurred[i].outline || f.shadow !== blurred[i].shadow;
        if ((f.outline || f.shadow) && (i === 0 ? changed || f.outline : changed)) visibleOn = n;
      });
      const r = el.getBoundingClientRect();
      const label = (el.getAttribute("aria-label") || el.textContent || el.getAttribute("placeholder") || "").trim().slice(0, 40);
      const id = `${el.tagName.toLowerCase()}#${el.id}.${String(el.className).split(" ").slice(0, 4).join(".")}|${label}`;
      return { id, visible: Boolean(visibleOn), onScreen: r.width > 0 && r.height > 0 };
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
