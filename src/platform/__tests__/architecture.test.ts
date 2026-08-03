/**
 * Architectural tests — enforce the module boundaries documented in
 * docs/01-product/13-MODULE-SPECIFICATIONS.md §4.
 *
 * These are cheap, static-analysis-style checks. They don't prove the whole
 * system is correct, but they prevent the two specific regressions the
 * design depends on nobody introducing quietly: a provider call that skips
 * the Warden, and a NEW server-side module reaching for a raw HTTP client
 * instead of going through platform/gateway.
 *
 * Scope note (docs 13-MODULE-SPECIFICATIONS.md §8.1 / 41-AI-ARCHITECTURE.md
 * §12 "current state"): the legacy src/services/aiGateway.ts and
 * server/routes/ai.ts predate this module boundary and are NOT yet migrated
 * — they are the documented next migration target, not a silent gap. This
 * test therefore scopes its "no raw fetch to a provider host" check to the
 * NEW platform/ and app/ trees, where the rule is actually enforced today.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

function listFiles(dir: string, out: string[] = []): string[] {
  if (!statSync(dir, { throwIfNoEntry: false })) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "__tests__" || entry === "node_modules") continue;
      listFiles(full, out);
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

const PLATFORM_ROOT = resolve(process.cwd(), "src/platform");
const APP_ROOT = resolve(process.cwd(), "src/app");

describe("architecture: egress boundary", () => {
  it("no file under src/platform, other than gateway/adapters.ts, constructs an outbound fetch() call", () => {
    const files = listFiles(PLATFORM_ROOT);
    const offenders: string[] = [];
    for (const file of files) {
      if (file.endsWith(join("gateway", "adapters.ts"))) continue; // the one sanctioned call site
      const content = readFileSync(file, "utf8");
      if (/\bfetch\s*\(/.test(content)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it("no file under src/app calls fetch() directly against a model provider — it must go through platform/gateway", () => {
    const files = listFiles(APP_ROOT);
    const offenders: string[] = [];
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      if (/\bfetch\s*\(/.test(content) && !content.includes("platform/gateway")) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("platform/gateway's public entry point does not re-export the raw adapter factory", async () => {
    const mod = await import("../gateway/gateway");
    expect(Object.keys(mod)).not.toContain("getAdapter");
  });
});
