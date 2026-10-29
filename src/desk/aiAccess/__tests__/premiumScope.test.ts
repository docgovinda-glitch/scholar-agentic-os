import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PREMIUM_FEATURES, PREMIUM_SCOPE_SENTENCE } from "../premiumScope";

const ROOT = resolve(__dirname, "../../../..");
const ROUTE_FILES = [
  "server/routes/project.ts",
  "server/routes/project/core/manuscriptAndGateRoutes.ts",
  "server/routes/studio.ts",
];

describe("Premium scope copy (PRODUCT_AUDIT P1-8)", () => {
  it("names every Premium feature and says the rest need the user's own AI", () => {
    for (const feature of PREMIUM_FEATURES) expect(PREMIUM_SCOPE_SENTENCE).toContain(feature);
    expect(PREMIUM_SCOPE_SENTENCE).toMatch(/Other workspaces use your own key or local AI\./);
  });

  it("lists exactly as many features as the server has Premium call sites", () => {
    const callSites = ROUTE_FILES.flatMap((f) =>
      readFileSync(resolve(ROOT, f), "utf8").match(/await runPremium\w+\(/g) ?? []
    );
    // If this fails, a Premium path was added or removed on the server:
    // update PREMIUM_FEATURES (and docs/AI-CALL-MAP.md) so the AI Access copy stays true.
    expect(callSites).toHaveLength(PREMIUM_FEATURES.length);
  });
});
