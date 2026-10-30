import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// B7: WCAG 2.1 A/AA (axe) at phone, tablet and desktop widths, with a
// full-page screenshot of each kept as a CI artifact (artifacts/e2e-results).
// These routes render signed out, so they run without the E2E accounts.
const ROUTES = ["/", "/signin", "/signup", "/reset-password", "/presentation"];
const WIDTHS = [375, 768, 1280];

for (const width of WIDTHS) {
  for (const route of ROUTES) {
    test(`${route} has no WCAG A/AA violations at ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(route);
      await page.waitForLoadState("networkidle");

      // No horizontal scroll: the page fits the viewport width.
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${route} scrolls sideways at ${width}px`).toBeLessThanOrEqual(1);

      const shot = testInfo.outputPath(`${route === "/" ? "root" : route.slice(1).replace(/\//g, "-")}-${width}.png`);
      await page.screenshot({ path: shot, fullPage: true });
      await testInfo.attach(`screenshot-${width}`, { path: shot, contentType: "image/png" });

      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      const summary = results.violations.map(
        (v) => `${v.impact} ${v.id} (${v.nodes.length}): ${v.help} → ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(", ")}`
      );
      expect(summary, `axe violations on ${route} at ${width}px`).toEqual([]);
    });
  }
}
