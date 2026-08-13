// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUpsert = vi.fn(async () => ({ data: null, error: null }));
const mockFrom = vi.fn(() => ({ upsert: mockUpsert }));
const mockGetUser = vi.fn(async () => ({ data: { user: { id: "u1" } } }));
const mockIsSupabaseConfigured = vi.fn(() => true);

vi.mock("../supabaseClient", () => ({
  getSupabaseClient: () => ({ auth: { getUser: mockGetUser }, from: mockFrom }),
  isSupabaseConfigured: () => mockIsSupabaseConfigured(),
}));

import { recommendLocalModel, saveManualHardwareProfile, type HardwareProfile } from "../hardwareProfiler";

function profile(overrides: Partial<HardwareProfile> = {}): HardwareProfile {
  return {
    os: "macOS",
    cpuCores: 8,
    architecture: "arm64",
    ramGb: 16,
    gpuInfo: null,
    vramGb: null,
    storageFreeGb: 100,
    detectedRuntimes: [{ id: "ollama", name: "Ollama", models: ["llama3"] }],
    detectionMethod: "browser-api",
    detectedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("recommendLocalModel", () => {
  it("recommends cloud over local when RAM is very low", () => {
    const rec = recommendLocalModel(profile({ ramGb: 4 }));
    expect(rec.sizeClass).toBe("cloud-recommended");
    expect(rec.warnings.length).toBeGreaterThan(0);
  });

  it("recommends a 3B-4B class for 8 GB", () => {
    expect(recommendLocalModel(profile({ ramGb: 8 })).sizeClass).toBe("3B–4B quantized");
  });

  it("recommends a 7B-8B class for 16 GB", () => {
    expect(recommendLocalModel(profile({ ramGb: 16 })).sizeClass).toBe("7B–8B quantized");
  });

  it("recommends a 13B+ class for 32 GB", () => {
    expect(recommendLocalModel(profile({ ramGb: 32 })).sizeClass).toBe("13B+ quantized");
  });

  it("never claims a specific speed — reasoning only describes headroom, not tokens/sec", () => {
    const rec = recommendLocalModel(profile({ ramGb: 16 }));
    expect(rec.reasoning).not.toMatch(/tokens\/sec|tok\/s/i);
  });

  it("warns when no local runtime was detected, regardless of RAM", () => {
    const rec = recommendLocalModel(profile({ ramGb: 16, detectedRuntimes: [] }));
    expect(rec.warnings.some((w) => /no local ai runtime/i.test(w))).toBe(true);
  });

  it("declines to recommend a size class when RAM could not be detected", () => {
    const rec = recommendLocalModel(profile({ ramGb: null }));
    expect(rec.sizeClass).toBe("unknown");
  });
});

describe("saveManualHardwareProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockIsSupabaseConfigured.mockReturnValue(true);
  });

  it("upserts with detection_method: manual", async () => {
    await saveManualHardwareProfile({ ramGb: 32, os: "Windows" });

    expect(mockFrom).toHaveBeenCalledWith("hardware_profiles");
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "u1", ram_gb: 32, os: "Windows", detection_method: "manual" })
    );
  });

  it("writes null for every field the user left blank, never a guessed fallback", async () => {
    await saveManualHardwareProfile({ ramGb: 16 });

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        ram_gb: 16,
        os: null,
        cpu_cores: null,
        architecture: null,
        gpu_info: null,
        vram_gb: null,
        storage_free_gb: null,
      })
    );
  });

  it("is a no-op when every field is blank — never writes an all-null row", async () => {
    await saveManualHardwareProfile({});
    await saveManualHardwareProfile({ os: "" });

    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("does nothing when Supabase isn't configured", async () => {
    mockIsSupabaseConfigured.mockReturnValue(false);
    await saveManualHardwareProfile({ ramGb: 16 });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("does nothing when there is no signed-in user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    await saveManualHardwareProfile({ ramGb: 16 });
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
