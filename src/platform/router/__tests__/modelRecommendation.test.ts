import { describe, it, expect } from "vitest";
import { recommendModels } from "../modelRecommendation";
import type { LiveModel } from "../modelCuration";

const NOW = Date.UTC(2026, 10, 9);
const day = 86_400_000;
const m = (id: string, ageDays: number, extra: Partial<LiveModel> = {}): LiveModel => ({ id, createdAt: NOW - ageDays * day, ...extra });

describe("recommendModels (live list only)", () => {
  it("recommends the newest balanced model, and offers the most capable and the fastest with reasons", () => {
    const live = [m("acme-pro-5", 30), m("acme-chat-5", 30), m("acme-chat-4", 400), m("acme-flash-5", 30), m("acme-embed-2", 10)];
    const r = recommendModels("acme", live, { now: NOW });
    expect(r.recommended?.id).toBe("acme-chat-5");
    expect(r.recommended?.role).toBe("recommended");
    expect(r.options.map((o) => o.role)).toEqual(expect.arrayContaining(["recommended", "most_capable", "fastest"]));
    expect(r.options.find((o) => o.role === "most_capable")?.id).toBe("acme-pro-5");
    expect(r.options.find((o) => o.role === "fastest")?.id).toBe("acme-flash-5");
    expect(r.options.every((o) => o.why.length > 10)).toBe(true);
    // Non-text models are never offered.
    expect(r.options.some((o) => o.id.includes("embed"))).toBe(false);
  });

  it("can only recommend what the provider listed: a retired model that is absent never appears", () => {
    const r = recommendModels("acme", [m("acme-chat-6", 10)], { now: NOW });
    expect(r.options.map((o) => o.id)).toEqual(["acme-chat-6"]);
  });

  it("falls back to the flagship, then the fast tier, when there is no balanced model", () => {
    expect(recommendModels("acme", [m("acme-pro-5", 5), m("acme-flash-5", 5)], { now: NOW }).recommended?.id).toBe("acme-pro-5");
    expect(recommendModels("acme", [m("acme-flash-5", 5)], { now: NOW }).recommended?.id).toBe("acme-flash-5");
  });

  it("skips models the provider marks deprecated, models too small to use, and excluded (quarantined) ones", () => {
    const live = [m("acme-chat-5", 5, { deprecated: true }), m("acme-chat-4", 90, { contextWindow: 4_000 }), m("acme-chat-3", 200), m("acme-other-2", 100)];
    const r = recommendModels("acme", live, { now: NOW, exclude: new Set(["acme-chat-3"]) });
    expect(r.options.map((o) => o.id)).not.toContain("acme-chat-5");
    expect(r.options.map((o) => o.id)).not.toContain("acme-chat-4");
    expect(r.options.map((o) => o.id)).not.toContain("acme-chat-3");
    expect(r.recommended?.id).toBe("acme-other-2");
  });

  it("returns nothing, rather than inventing a model, for an empty or unusable list", () => {
    expect(recommendModels("acme", [], { now: NOW })).toMatchObject({ recommended: null, options: [] });
    expect(recommendModels("acme", [m("acme-embed-1", 1), m("acme-tts-1", 1)], { now: NOW }).recommended).toBeNull();
  });

  it("curates an aggregator's hundreds of models per vendor instead of letting one vendor win", () => {
    const vendors = ["alpha", "beta", "gamma", "delta", "omega"];
    const live: LiveModel[] = [];
    vendors.forEach((v, vi) => { for (let i = 1; i <= 9; i++) live.push(m(`${v}/${v}-chat-${i}`, vi * 20 + (10 - i))); });
    const r = recommendModels("router", live, { now: NOW });
    expect(r.recommended).not.toBeNull();
    expect(r.options.length).toBeGreaterThan(1);
    expect(new Set(r.options.map((o) => o.id.split("/")[0])).size).toBeGreaterThan(1);
    expect(r.totalListed).toBe(45);
  });
});
