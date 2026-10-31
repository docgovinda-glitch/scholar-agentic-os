import { describe, it, expect } from "vitest";
import { bestDiscovered, curatedToSpec } from "../bestModels";
import type { DiscoveredModel } from "../../../services/modelDiscovery";

// Fictional ids: the rules, not a model list, are under test.
const d = (id: string, extra: Partial<DiscoveredModel> = {}): DiscoveredModel => ({
  id, modelId: id, providerId: "openai", displayName: id, capabilities: [], source: "live_discovery", ...extra,
});

describe("best models from a live list", () => {
  it("keeps the newest generation per tier and drops embeddings and dated snapshots", () => {
    const best = bestDiscovered("openai", [
      d("zeta-5-pro"), d("zeta-6-pro"), d("zeta-6-pro-2026-08-01"),
      d("zeta-6-mini"), d("zeta-5-mini"), d("text-embedding-9"),
    ]);
    expect(best.map((m) => m.id)).toEqual(["zeta-6-pro", "zeta-6-mini"]);
  });

  it("badges carry their evidence; none are invented", () => {
    const best = bestDiscovered("openai", [d("zeta-6-pro", { contextWindow: 400_000 }), d("zeta-6-mini", { contextWindow: 128_000 })]);
    const pro = best.find((m) => m.id === "zeta-6-pro")!;
    expect(pro.badges.map((b) => b.label)).toEqual(["Most capable", "Largest context"]);
    expect(pro.badges[1].evidence).toContain("400,000");
    // No speed data on the client, so no "Fastest" badge.
    expect(best.flatMap((m) => m.badges).some((b) => b.id === "fastest")).toBe(false);
  });

  it("a picker option shows the badges in its label", () => {
    const [pro] = bestDiscovered("openai", [d("zeta-6-pro")]);
    expect(curatedToSpec("openai", pro, ["byok"]).displayName).toBe("zeta-6-pro — Most capable");
  });
});
