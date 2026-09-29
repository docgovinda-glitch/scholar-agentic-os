/**
 * Architectural tests — enforce module boundaries and security invariants.
 *
 * Verifies that platform and app code route provider calls through the platform gateway.
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

  it("server/routes/studio.ts (the new architecture's route) does not call fetch() directly", () => {
    const file = resolve(process.cwd(), "server/routes/studio.ts");
    const content = readFileSync(file, "utf8");
    expect(/\bfetch\s*\(/.test(content)).toBe(false);
  });
});
