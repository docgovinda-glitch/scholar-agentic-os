/**
 * State hashing for gate sign-off (docs 30-ACADEMIC-WORKFLOW-ARCHITECTURE.md
 * §2.2). Uses the Web Crypto API rather than Node's `crypto` module
 * deliberately: `globalThis.crypto.subtle` is available in both the
 * browser and Node 20+, keeping this on the isomorphic path that
 * docs/01-product/13-MODULE-SPECIFICATIONS.md §2 asks domain/app code to
 * stay on, even though no client exists yet to exercise the browser side.
 */

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(",")}}`;
}

/**
 * Hash a snapshot of "what was approved" — key order does not affect the
 * result, so two logically-identical snapshots always hash the same way.
 */
export async function computeStateHash(snapshot: unknown): Promise<string> {
  const json = stableStringify(snapshot);
  const bytes = new TextEncoder().encode(json);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
