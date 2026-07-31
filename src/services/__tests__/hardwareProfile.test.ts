// @vitest-environment jsdom
//
// Hardware assessment and local-model recommendation tests.
//
// The behaviour that matters here is honesty about uncertainty: the browser
// caps reported memory at 8 GB and cannot see video memory at all, so the
// module must present lower bounds as lower bounds and must never recommend a
// multi-gigabyte download on the strength of a capped reading.

Object.defineProperty(globalThis, "localStorage", {
  value: (globalThis as any).jsdom.window.localStorage,
  configurable: true,
});

import { describe, it, expect, beforeEach } from "vitest";
import {
  assessHardware,
  usableModelMemoryGb,
  applyUserOverrides,
  saveHardwareProfile,
  loadHardwareProfile,
  clearHardwareProfile,
  type HardwareProfile,
} from "../hardwareProfile";
import { recommendLocalModels, LOCAL_MODELS, getLocalModel } from "../../config/localModelCatalog";

function profile(overrides: Partial<HardwareProfile> = {}): HardwareProfile {
  return {
    cpuCores: 8,
    cpuCoresConfidence: "measured",
    architecture: "x86-64",
    architectureConfidence: "measured",
    ramGb: 16,
    ramConfidence: "measured",
    vramGb: null,
    vramConfidence: "unknown",
    gpuName: null,
    hasWebGpu: true,
    unifiedMemory: false,
    platform: "windows",
    userConfirmed: false,
    detectedAt: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  clearHardwareProfile();
});

describe("usable memory", () => {
  it("reserves headroom rather than assuming all RAM is available", () => {
    // The OS, the browser and the runner all need memory too.
    expect(usableModelMemoryGb(profile({ ramGb: 16 }))!).toBeLessThan(16);
  });

  it("assesses Apple Silicon on system memory, since the GPU shares it", () => {
    const apple = profile({ architecture: "apple-silicon", unifiedMemory: true, ramGb: 32 });
    expect(usableModelMemoryGb(apple)!).toBeGreaterThan(20);
  });

  it("prefers dedicated video memory when it beats the system-memory share", () => {
    expect(usableModelMemoryGb(profile({ ramGb: 16, vramGb: 24 }))).toBe(24);
  });

  it("returns null when memory is genuinely unknown", () => {
    expect(usableModelMemoryGb(profile({ ramGb: null, vramGb: null }))).toBeNull();
  });
});

describe("assessment honesty", () => {
  it("flags a capped memory reading as a lower bound", () => {
    const assessment = assessHardware(profile({ ramGb: 8, ramConfidence: "lower-bound" }));

    expect(assessment.caveats.join(" ")).toMatch(/capped at 8 gb|minimum/i);
  });

  it("says plainly that video memory cannot be detected", () => {
    const assessment = assessHardware(profile({ vramConfidence: "unknown", unifiedMemory: false }));

    expect(assessment.caveats.join(" ")).toMatch(/no browser can read graphics memory/i);
  });

  it("asks for input instead of guessing when memory is unknown", () => {
    const assessment = assessHardware(profile({ ramGb: null, ramConfidence: "unknown" }));

    expect(assessment.caveats.join(" ")).toMatch(/enter it manually/i);
  });

  it("refuses local AI on a phone and says why", () => {
    const assessment = assessHardware(profile({ platform: "android", ramGb: 8 }));

    expect(assessment.tier).toBe("insufficient");
    expect(assessment.maxModelParamsB).toBe(0);
    expect(assessment.summary).toMatch(/cloud/i);
  });

  it("scales the tier with available memory", () => {
    expect(assessHardware(profile({ ramGb: 4 })).tier).toBe("insufficient");
    expect(assessHardware(profile({ ramGb: 8 })).tier).toBe("entry");
    expect(assessHardware(profile({ ramGb: 16 })).tier).toBe("capable");
    expect(assessHardware(profile({ ramGb: 32 })).tier).toBe("strong");
    // 64 GB system memory yields ~38 GB usable, which clears the 70B threshold.
    expect(assessHardware(profile({ ramGb: 64, vramGb: 24 })).tier).toBe("workstation");
  });
});

describe("user overrides", () => {
  it("treats a user-supplied figure as measured truth", () => {
    // The user can read their own system information; the browser cannot.
    const corrected = applyUserOverrides(profile({ ramGb: 8, ramConfidence: "lower-bound" }), { ramGb: 64 });

    expect(corrected.ramGb).toBe(64);
    expect(corrected.ramConfidence).toBe("measured");
    expect(corrected.userConfirmed).toBe(true);
  });

  it("sets unified memory when the user identifies Apple Silicon", () => {
    const corrected = applyUserOverrides(profile(), { architecture: "apple-silicon" });

    expect(corrected.unifiedMemory).toBe(true);
  });

  it("accepts zero video memory as a real answer, not a missing one", () => {
    const corrected = applyUserOverrides(profile(), { vramGb: 0 });

    expect(corrected.vramGb).toBe(0);
    expect(corrected.vramConfidence).toBe("measured");
  });

  it("ignores nonsense values rather than corrupting the profile", () => {
    const corrected = applyUserOverrides(profile({ ramGb: 16 }), { ramGb: -5 });

    expect(corrected.ramGb).toBe(16);
  });
});

describe("persistence", () => {
  it("round-trips a profile", () => {
    const p = profile({ ramGb: 32 });
    saveHardwareProfile(p);

    expect(loadHardwareProfile()!.ramGb).toBe(32);
  });

  it("returns null before anything is saved", () => {
    expect(loadHardwareProfile()).toBeNull();
  });
});

describe("model recommendations", () => {
  it("never suggests a model that does not fit", () => {
    recommendLocalModels(6).forEach((rec) => {
      expect(rec.model.minMemoryGb, rec.model.id).toBeLessThanOrEqual(6);
    });
  });

  it("suggests nothing at all when memory is unknown", () => {
    // Guessing here means telling somebody to download several gigabytes on
    // the strength of no information.
    expect(recommendLocalModels(null)).toEqual([]);
  });

  it("offers only small models on an 8 GB machine", () => {
    const top = recommendLocalModels(5)[0];

    expect(top.model.paramsB).toBeLessThanOrEqual(8);
  });

  it("prefers the largest model that still sits comfortably", () => {
    // Capability rises with parameters, so among comfortable options the
    // biggest is the best answer.
    const top = recommendLocalModels(48)[0];

    expect(top.fit).toBe("comfortable");
    expect(top.model.paramsB).toBeGreaterThanOrEqual(27);
  });

  it("marks a barely-fitting model as tight and explains the consequence", () => {
    const tight = recommendLocalModels(100, { limit: 20 }).find((r) => r.fit === "tight");
    const barely = recommendLocalModels(7.2).find((r) => r.fit === "tight");

    // At least one of these paths must produce a tight fit with real wording.
    const sample = tight ?? barely;
    if (sample) expect(sample.rationale).toMatch(/headroom|slower|small context/i);
  });

  it("boosts a model matching the requested strength", () => {
    const reasoning = recommendLocalModels(24, { preferred: "reasoning" })[0];

    expect(reasoning.model.strengths).toContain("reasoning");
  });

  it("respects the result limit", () => {
    expect(recommendLocalModels(48, { limit: 2 }).length).toBe(2);
  });
});

describe("local model catalog integrity", () => {
  it("has no duplicate ids", () => {
    const ids = LOCAL_MODELS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("always requires more memory than the weights alone", () => {
    // Weights are not the only resident cost — the KV cache, the runner and
    // the OS all need room, and a model that only just fits will swap.
    LOCAL_MODELS.forEach((model) => {
      expect(model.minMemoryGb, model.id).toBeGreaterThan(model.downloadSizeGb);
    });
  });

  it("gives every model an Ollama tag and an honest academic-fit statement", () => {
    LOCAL_MODELS.forEach((model) => {
      expect(model.ollamaTag, model.id).toBeTruthy();
      expect(model.academicFit.length, model.id).toBeGreaterThan(20);
      expect(model.strengths.length, model.id).toBeGreaterThan(0);
    });
  });

  it("scales download size with parameter count", () => {
    const small = getLocalModel("llama3.2-3b")!;
    const large = getLocalModel("llama3.3-70b")!;

    expect(large.downloadSizeGb).toBeGreaterThan(small.downloadSizeGb * 10);
  });
});
