import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * `h-screen h-[100dvh]` looks like "100vh, upgraded to dvh where supported", but Tailwind orders the generated
 * CSS rules, not the class names: `.h-screen` is emitted AFTER `.h-[100dvh]`, so 100vh wins. On iOS Safari/Chrome
 * 100vh is the tall viewport (browser toolbars retracted), so a full-height page runs under the bottom toolbar and
 * its pinned composer and nav bar are cut off. Use the single `h-dvh` utility.
 */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (name === "node_modules" || name === "__tests__") return [];
    return statSync(full).isDirectory() ? sourceFiles(full) : /\.(tsx|ts|css)$/.test(name) ? [full] : [];
  });
}

describe("full-height layouts", () => {
  it("never pair h-screen with a dvh height (100vh would win and hide the bottom bar on iOS)", () => {
    const offenders = sourceFiles("src").filter((f) => {
      const text = readFileSync(f, "utf8");
      return /h-screen[^"'`\n]*h-\[100dvh\]|h-\[100dvh\][^"'`\n]*h-screen/.test(text);
    });
    expect(offenders).toEqual([]);
  });
});
