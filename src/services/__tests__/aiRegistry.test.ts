// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockIsSupabaseConfigured = vi.fn(() => true);
const from = vi.fn();

vi.mock("../supabaseClient", () => ({
  isSupabaseConfigured: () => mockIsSupabaseConfigured(),
  getSupabaseClient: () => ({ from }),
}));

const { listProviders, listModelsForProvider } = await import("../aiRegistry");

function chain(result: { data: unknown; error: unknown }) {
  const c: any = {
    select: vi.fn(() => c),
    eq: vi.fn(() => c),
    order: vi.fn(() => Promise.resolve(result)),
  };
  return c;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockIsSupabaseConfigured.mockReturnValue(true);
});

describe("listProviders", () => {
  it("maps snake_case rows to camelCase providers", async () => {
    from.mockReturnValue(
      chain({
        data: [
          {
            id: "gemini",
            name: "Google Gemini",
            category: "byok",
            api_style: "gemini",
            base_url: "https://x",
            docs_url: "https://y",
            free_tier_kind: "freemium",
            free_tier_note: "note",
            enabled: true,
            metadata: { icon: "x" },
          },
        ],
        error: null,
      })
    );

    const result = await listProviders();
    expect(result).toEqual([
      {
        id: "gemini",
        name: "Google Gemini",
        category: "byok",
        apiStyle: "gemini",
        baseUrl: "https://x",
        docsUrl: "https://y",
        freeTierKind: "freemium",
        freeTierNote: "note",
        enabled: true,
        metadata: { icon: "x" },
      },
    ]);
  });

  it("returns an empty array rather than throwing when Supabase is not configured", async () => {
    mockIsSupabaseConfigured.mockReturnValue(false);
    expect(await listProviders()).toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });

  it("returns an empty array, not throws, on a query error", async () => {
    from.mockReturnValue(chain({ data: null, error: { message: "boom" } }));
    expect(await listProviders()).toEqual([]);
  });
});

describe("listModelsForProvider", () => {
  it("maps model rows and defaults missing capabilities/modalities", async () => {
    from.mockReturnValue(
      chain({
        data: [
          {
            id: "gemini:gemini-2.5-flash",
            provider_id: "gemini",
            model_id: "gemini-2.5-flash",
            display_name: "gemini-2.5-flash",
            context_window: null,
            capabilities: null,
            modalities: null,
            speed_class: "fast",
            cost_class: "free",
            premium_eligible: false,
            free_eligible: true,
            enabled: true,
            last_verified_at: null,
          },
        ],
        error: null,
      })
    );

    const result = await listModelsForProvider("gemini");
    expect(result[0]).toMatchObject({
      id: "gemini:gemini-2.5-flash",
      providerId: "gemini",
      capabilities: {},
      modalities: ["text"],
      freeEligible: true,
      premiumEligible: false,
    });
  });
});
