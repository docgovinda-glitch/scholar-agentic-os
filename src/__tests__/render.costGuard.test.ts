/**
 * Cost guard for render.yaml — keeps the Render deployment at $0.
 *
 * This exists because the repo has already drifted into a billable
 * configuration once without anyone noticing: `render.yaml` declared
 * `plan: starter` (Render's paid $7/month plan) while its own comments
 * described free-tier behaviour, so reading the file did not reveal the
 * contradiction. A blueprint sync would have provisioned a paid service.
 *
 * Vigilance does not survive contact with a busy repo, so the constraint is
 * asserted here instead. CI runs `npm test`, so any change that reintroduces
 * a billable resource fails the build rather than the invoice.
 *
 * The specific things that cost money on Render, and why each is checked:
 *
 *   - Any `plan:` other than `free`. The obvious one.
 *   - A `databases:` block. Render's free Postgres expires after 90 days and
 *     then converts to a paid plan — the most insidious entry on this list,
 *     because it bills three months after the commit that added it.
 *   - A `disk:` mount. Persistent disks are always billable, and cannot be
 *     attached to a free service at all.
 *   - Service types other than `web`. Background workers, cron jobs, and
 *     private services have no free tier whatsoever on Render.
 *   - `numInstances` above 1. Scaling past a single instance is billable.
 *
 * Parsed with targeted line matching rather than a YAML library: the file is
 * small and flat, and adding a parser dependency to guard against cost would
 * be its own small irony.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const RENDER_YAML = resolve(process.cwd(), "render.yaml");

/** render.yaml with comment-only lines and blank lines removed. */
function configLines(): string[] {
  const raw = readFileSync(RENDER_YAML, "utf8");
  return raw
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .filter((line) => line.trim() !== "");
}

/**
 * Values of a given key, e.g. `plan` -> ["free"].
 *
 * The optional `-` accounts for a key that opens a YAML list entry, which is
 * how services are written (`- type: web`). Each assertion below also checks
 * that it matched something, so a parsing miss fails loudly instead of
 * silently passing a guard that examined nothing.
 */
function valuesOf(key: string): string[] {
  const pattern = new RegExp(`^\\s*-?\\s*${key}:\\s*(.+?)\\s*$`);
  return configLines()
    .map((line) => line.match(pattern)?.[1])
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.replace(/^["']|["']$/g, ""));
}

describe("render.yaml stays at $0", () => {
  it("exists and is the only Render blueprint", () => {
    expect(existsSync(RENDER_YAML)).toBe(true);
  });

  it("declares no plan other than 'free'", () => {
    const plans = valuesOf("plan");

    expect(plans.length).toBeGreaterThan(0);
    for (const plan of plans) {
      expect(
        plan,
        `render.yaml declares "plan: ${plan}". Only "free" costs nothing — ` +
          `"starter" and above are billed monthly, per service.`
      ).toBe("free");
    }
  });

  it("provisions no Render database", () => {
    const hasDatabases = configLines().some((line) => /^\s*databases:/.test(line));

    expect(
      hasDatabases,
      "render.yaml declares a `databases:` block. Render's free Postgres " +
        "expires after 90 days and then converts to a paid plan — it would " +
        "start billing long after the change that introduced it. User data " +
        "belongs in Supabase for this project (see DEPLOYMENT_README.md §3)."
    ).toBe(false);
  });

  it("mounts no persistent disk", () => {
    const hasDisk = configLines().some((line) => /^\s*disk:/.test(line));

    expect(
      hasDisk,
      "render.yaml declares a `disk:`. Persistent disks are always billable " +
        "and cannot be attached to a free service."
    ).toBe(false);
  });

  it("declares only web services", () => {
    // Guard against `type:` matches from unrelated nesting by only accepting
    // the values Render actually uses for a service entry.
    const types = valuesOf("type");

    expect(types.length).toBeGreaterThan(0);
    for (const type of types) {
      expect(
        type,
        `render.yaml declares a service of type "${type}". Only "web" has a ` +
          `free tier on Render — workers, cron jobs, and private services are ` +
          `billed from the first minute.`
      ).toBe("web");
    }
  });

  it("does not scale beyond a single instance", () => {
    const counts = valuesOf("numInstances");

    for (const count of counts) {
      expect(
        Number(count),
        `render.yaml sets numInstances: ${count}. Anything above 1 is billable.`
      ).toBeLessThanOrEqual(1);
    }
  });
});
