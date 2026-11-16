import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Coursework UI should use the semantic tokens (--surface-*, --text-*, --border-*,
 * --accent-*), not raw Tailwind palette classes. The count may only go down:
 * lower BASELINE when you migrate a component.
 */
const BASELINE = 757;
const RAW = /\b(?:bg|text|border|ring|fill|stroke)-(?:neutral|emerald|purple|blue|red|amber|green|yellow|orange|indigo|rose|slate|gray|zinc|stone)-\d{2,3}\b/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== "__tests__") walk(p, out);
    } else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

describe("coursework palette ratchet", () => {
  it("does not add raw palette classes", () => {
    const count = walk(join(__dirname, "..")).reduce((n, f) => n + (readFileSync(f, "utf8").match(RAW)?.length ?? 0), 0);
    expect(count).toBeLessThanOrEqual(BASELINE);
  });
});
