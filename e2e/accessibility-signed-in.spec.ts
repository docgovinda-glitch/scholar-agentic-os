import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { AUTH_FILES } from "./authFiles";

// B7: WCAG 2.1 A/AA (axe) on the signed-in screens, at phone and desktop
// widths, with no sideways scroll. Screenshots are kept as CI artifacts.
const A = { email: process.env.E2E_A_EMAIL, password: process.env.E2E_A_PASSWORD };
test.skip(!A.email || !A.password, "E2E_A_* test account not configured");
test.use({ storageState: AUTH_FILES.A });

const WIDTHS = [375, 1280];
const PAGES = ["/projects", "/vault", "/ai-access", "/settings"];
const WORKSPACES = [
  { name: "coursework", outputTypeId: "OT-01" },
  { name: "thesis", outputTypeId: "OT-09" },
  { name: "journal", outputTypeId: "OT-10" },
  { name: "proposal", outputTypeId: "OT-19" },
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

async function check(page: Page, label: string, width: number, testInfo: import("@playwright/test").TestInfo) {
  await page.waitForLoadState("networkidle");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  // Name the widest elements that stick out, so a failure says what to fix.
  const culprits =
    overflow > 1
      ? await page.evaluate(() =>
          Array.from(document.querySelectorAll("body *"))
            .map((el) => ({ el, r: el.getBoundingClientRect() }))
            .filter(({ r }) => r.right > window.innerWidth + 1 && r.width > 0)
            .sort((a, b) => b.r.right - a.r.right)
            .slice(0, 6)
            .map(({ el, r }) => `${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 6).join(".")} right=${Math.round(r.right)} w=${Math.round(r.width)}`)
        )
      : [];
  expect(overflow, `${label} scrolls sideways at ${width}px: ${culprits.join(" | ")}`).toBeLessThanOrEqual(1);

  const shot = testInfo.outputPath(`${label}-${width}.png`);
  await page.screenshot({ path: shot, fullPage: true });
  await testInfo.attach(`screenshot-${label}-${width}`, { path: shot, contentType: "image/png" });

  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const summary = results.violations.map(
    (v) =>
      `${v.impact} ${v.id} (${v.nodes.length}): ${v.help} → ${v.nodes
        .map((n) => `${n.target.join(" ")}${v.id === "color-contrast" ? ` [${(n.any[0]?.message || "").slice(0, 90)}]` : ""}`)
        .join(" | ")}`
  );
  expect(summary, `axe violations on ${label} at ${width}px`).toEqual([]);
}

for (const width of WIDTHS) {
  for (const route of PAGES) {
    test(`${route} (signed in) has no WCAG A/AA violations at ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      expect(new URL(page.url()).pathname, "still signed in").not.toMatch(/signin|login/);
      await check(page, route.slice(1), width, testInfo);
    });
  }

  for (const ws of WORKSPACES) {
    test(`${ws.name} workspace has no WCAG A/AA violations at ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/projects");
      const created = await api(page, "POST", "/api/projects", { outputTypeId: ws.outputTypeId });
      expect(created.status).toBe(201);
      const id: string = created.json.projectId ?? created.json.id;
      try {
        await page.goto(`/projects/${id}`);
        await check(page, `workspace-${ws.name}`, width, testInfo);
      } finally {
        await api(page, "DELETE", `/api/projects/${id}`);
      }
    });
  }
}
