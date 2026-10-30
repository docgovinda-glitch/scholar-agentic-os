import { describe, it, expect } from "vitest";
import { CLOUD_PROVIDERS, chatUrl } from "../../../config/providerCatalog";
import { LOCAL_RUNNERS } from "../../../config/localRunnerCatalog";
import { getAdapter } from "../adapters";

// B4: every provider listed in AI Access can actually be connected. A catalog
// entry without a gateway adapter would show up in the UI but never work.
describe("provider catalog coverage", () => {
  it.each(CLOUD_PROVIDERS.map((p) => [p.id, p] as const))("cloud provider %s has an adapter and a chat URL", (_id, spec) => {
    expect(getAdapter(spec.id)).toBeDefined();
    if (spec.requiresCustomBaseUrl) {
      // Account-scoped address (e.g. Cloudflare): the UI must say what to enter.
      expect(spec.customBaseUrlHint).toMatch(/^https:\/\//);
      expect(() => new URL(chatUrl(spec, "https://example.test/v1"))).not.toThrow();
    } else {
      expect(() => new URL(chatUrl(spec))).not.toThrow();
    }
  });

  it.each(LOCAL_RUNNERS.map((r) => [r.id] as const))("local runner %s has an adapter", (id) => {
    expect(getAdapter(id)).toBeDefined();
  });

  it("provider ids are unique", () => {
    const ids = [...CLOUD_PROVIDERS.map((p) => p.id), ...LOCAL_RUNNERS.map((r) => r.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });
});
