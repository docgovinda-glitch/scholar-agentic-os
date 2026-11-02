import { test, expect } from "@playwright/test";
import JSZip from "jszip";

// Presentation Studio (OT-22) works signed out, so these run without auth.
// No AI provider is configured in CI: decks come from the offline composer.

async function buildDeck(page: import("@playwright/test").Page) {
  await page.goto("/presentation");
  await page.getByLabel(/^Title/).fill("Climate migration in South Asia");
  await page.getByRole("button", { name: "Starter outline without AI" }).click();
  await page.getByRole("button", { name: /03 Edit Slides/ }).first().click();
  await expect(page.getByTestId("wysiwyg-slide-card")).toBeVisible();
}

test("builds a deck and edits it in the studio", async ({ page }) => {
  await buildDeck(page);
  await expect(page.getByTestId("studio-thumb-0")).toBeVisible();
  await expect(page.getByTestId("studio-thumb-1")).toBeVisible();
});

test("switching layouts keeps the card's text", async ({ page }) => {
  await buildDeck(page);
  await page.getByTestId("studio-thumb-1").click();
  const card = page.getByTestId("wysiwyg-slide-card");
  // The headline: the longest text line on the card (textContent ignores CSS case transforms).
  const lines = await card.locator("*").evaluateAll((els) =>
    els.filter((e) => e.children.length === 0).map((e) => (e.textContent || "").trim()).filter((t) => t.length > 8)
  );
  expect(lines.length).toBeGreaterThan(0);
  const headline = lines.sort((a, b) => b.length - a.length)[0];
  for (const layout of ["bento", "list", "comparison", "timeline", "statement"]) {
    await page.getByTestId(`layout-option-${layout}`).click();
    // The headline survives every layout switch (layouts convert content, never replace it).
    await expect(card).toContainText(headline);
  }
});

test("switching theme restyles the card", async ({ page }) => {
  await buildDeck(page);
  const card = page.getByTestId("wysiwyg-slide-card");
  // Theme tokens are applied as inline colours, so the card's markup changes.
  const styling = async () => card.evaluate((el) => el.innerHTML.match(/(rgb|#)[^;"]*/g)?.join("|") ?? "");
  const before = await styling();
  await page.getByTestId("studio-theme-menu-btn").click();
  const items = page.getByRole("menuitemradio");
  const count = await items.count();
  expect(count).toBeGreaterThan(1);
  for (let i = 0; i < count; i++) {
    if ((await items.nth(i).getAttribute("aria-checked")) !== "true") {
      await items.nth(i).click();
      break;
    }
  }
  await expect.poll(styling).not.toBe(before);
});

test("presents full-screen and moves with the keyboard", async ({ page }) => {
  await buildDeck(page);
  await page.getByRole("button", { name: /04 Present/ }).first().click();
  await page.getByTestId("present-fullscreen-btn").click();
  await expect(page.getByTestId("live-slide-player")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("live-slide-player")).toBeHidden();
});

test("exports a .pptx with one slide per card", async ({ page }) => {
  await buildDeck(page);
  const cards = await page.locator('[data-testid^="studio-thumb-"]').count();
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("export-pptx-btn").first().click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.pptx$/);
  const path = await download.path();
  const zip = await JSZip.loadAsync(await (await import("node:fs/promises")).readFile(path!));
  const slides = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
  expect(slides.length).toBe(cards);
});
