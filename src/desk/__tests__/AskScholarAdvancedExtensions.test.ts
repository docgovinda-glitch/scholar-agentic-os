// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// A signed-in session: thread sync sends a bearer token and skips the request without one.
const session = vi.hoisted(() => ({ token: "test-token" as string | null }));
vi.mock("../../services/supabaseClient", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseClient: () => ({
    auth: { getSession: async () => ({ data: { session: session.token ? { access_token: session.token } : null } }) },
  }),
}));
import {
  extractSeedClaimsFromSynthesis,
} from "../dashboard/askScholarAnswer";
import {
  loadLocalAskScholarThreads,
  saveLocalAskScholarThreads,
  mergeAskScholarThreads,
  fetchAskScholarThreadsFromServer,
  syncAskScholarThreadsToServer,
  type AskScholarConversationThread,
} from "../../services/askScholarThreadSync";
import {
  verifyAndEnrichDOIMetadataBatch,
  type RawSourceInput,
} from "../../citation_compliance/cslEngine";

describe("AskScholar Advanced Architecture Extensions", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. extractSeedClaimsFromSynthesis (Claim-Evidence Graph Handoff)", () => {
    it("extracts cited sentences into structured claims with matching source citations", () => {
      const synthesisText = `
Transformer architectures rely entirely on self-attention mechanisms to compute representations without sequence-aligned recurrent operations [1]. Furthermore, residual connections around each of the two sub-layers enable smooth gradient backpropagation across deep stacks [2]. Recent empirical benchmarks show that pre-trained foundation models achieve superior few-shot transfer across biomedical tasks.
      `.trim();

      const sources = [
        {
          id: "src-1",
          title: "Attention Is All You Need",
          authors: ["Vaswani, Ashish", "Shazeer, Noam"],
          year: 2017,
          doi: "10.5555/3295222.3295349",
          snippet: "We propose the Transformer, a model architecture eschewing recurrence and entirely relying on an attention mechanism.",
        },
        {
          id: "src-2",
          title: "Deep Residual Learning for Image Recognition",
          authors: ["He, Kaiming", "Zhang, Xiangyu"],
          year: 2016,
          doi: "10.1109/CVPR.2016.90",
          snippet: "We present a residual learning framework to ease the training of networks that are substantially deeper than those used previously.",
        },
      ];

      const seedClaims = extractSeedClaimsFromSynthesis(synthesisText, sources);

      expect(seedClaims.length).toBeGreaterThanOrEqual(2);
      const claim1 = seedClaims[0];
      expect(claim1.claim.text).toContain("Transformer architectures rely entirely on self-attention");
      expect(claim1.binding).toBeDefined();
      expect(claim1.binding?.evidence[0].sourceId).toBe("src-1");
      expect(claim1.binding?.evidence[0].quote).toContain("Transformer");

      const claim2 = seedClaims[1];
      expect(claim2.claim.text).toContain("residual connections around each of the two sub-layers");
      expect(claim2.binding).toBeDefined();
      expect(claim2.binding?.evidence[0].sourceId).toBe("src-2");
      expect(claim2.binding?.evidence[0].quote).toContain("residual learning");
    });

    it("returns empty array when text contains no valid sentences or sources", () => {
      expect(extractSeedClaimsFromSynthesis("", [])).toEqual([]);
      expect(extractSeedClaimsFromSynthesis("Short sentence.", [])).toEqual([]);
    });
  });

  describe("2. Cross-Session & Cross-Device Thread Synchronization", () => {
    const mockThreads: AskScholarConversationThread[] = [
      {
        id: "thread-1",
        title: "Deep Research on Transformer Bounds",
        updatedAt: "10:01 AM",
        updatedAtIso: "2026-11-05T10:01:00Z",
        messages: [
          {
            id: "m1",
            sender: "user",
            text: "Evaluate reasoning bounds of LLMs",
            timestamp: "10:00",
          },
          {
            id: "m2",
            sender: "assistant",
            text: "Empirical bounds show multi-hop reasoning requires explicit scratchpads.",
            timestamp: "10:01",
          },
        ],
      },
    ];

    it("saves and loads threads locally scoped by user email", () => {
      saveLocalAskScholarThreads(mockThreads, "researcher@scholar.org");
      const loaded = loadLocalAskScholarThreads("researcher@scholar.org");
      expect(loaded).toHaveLength(1);
      expect(loaded[0].id).toBe("thread-1");
      expect(loaded[0].title).toBe("Deep Research on Transformer Bounds");

      // Scoped key matches userEmail
      const otherLoaded = loadLocalAskScholarThreads("other@scholar.org");
      expect(otherLoaded).toHaveLength(1); // fallback to base storage when other scope is empty
      expect(otherLoaded[0].id).toBe("thread-1");
    });

    it("merges local and remote threads keeping the version with more messages or newer updatedAtIso", () => {
      const local: AskScholarConversationThread[] = [
        {
          id: "thread-1",
          title: "Older Version",
          updatedAt: "10:00 AM",
          updatedAtIso: "2026-11-05T10:00:00Z",
          messages: [
            { id: "m1", sender: "user", text: "Q1", timestamp: "10:00" },
          ],
        },
        {
          id: "thread-local-only",
          title: "Local Offline Thread",
          updatedAt: "10:05 AM",
          updatedAtIso: "2026-11-05T10:05:00Z",
          messages: [],
        },
      ];

      const remote: AskScholarConversationThread[] = [
        {
          id: "thread-1",
          title: "Newer Remote Version",
          updatedAt: "10:01 AM",
          updatedAtIso: "2026-11-05T10:01:00Z",
          messages: [
            { id: "m1", sender: "user", text: "Q1", timestamp: "10:00" },
            { id: "m2", sender: "assistant", text: "A1", timestamp: "10:01" },
          ],
        },
        {
          id: "thread-remote-only",
          title: "Remote Work Laptop Thread",
          updatedAt: "10:10 AM",
          updatedAtIso: "2026-11-05T10:10:00Z",
          messages: [],
        },
      ];

      const merged = mergeAskScholarThreads(local, remote);
      expect(merged).toHaveLength(3);
      const t1 = merged.find((t) => t.id === "thread-1");
      expect(t1?.title).toBe("Newer Remote Version");
      expect(t1?.messages).toHaveLength(2);
      expect(merged.some((t) => t.id === "thread-local-only")).toBe(true);
      expect(merged.some((t) => t.id === "thread-remote-only")).toBe(true);
    });

    it("syncs and fetches threads from server endpoint gracefully", async () => {
      const fakeFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ threads: mockThreads }),
      });
      global.fetch = fakeFetch;

      const fetched = await fetchAskScholarThreadsFromServer("researcher@scholar.org", {
        allowInTest: true,
      });
      expect(fetched).toHaveLength(1);
      expect(fakeFetch).toHaveBeenCalledWith(
        "/api/ai/threads",
        expect.objectContaining({
          method: "GET",
        })
      );

      const fakePost = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, count: 1 }),
      });
      global.fetch = fakePost;

      const synced = await syncAskScholarThreadsToServer(mockThreads, "researcher@scholar.org", {
        allowInTest: true,
      });
      expect(synced).toBe(true);
      expect(fakePost).toHaveBeenCalledWith(
        "/api/ai/threads",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ "Content-Type": "application/json" }),
          body: JSON.stringify({ threads: mockThreads }),
        })
      );
    });
  });

  describe("2b. thread sync without a session", () => {
    const mockThreads: AskScholarConversationThread[] = [
      { id: "t", title: "Q", updatedAt: "10:00", updatedAtIso: "2026-11-05T10:00:00Z", messages: [{ id: "m1", sender: "user", text: "Q", timestamp: "10:00" }] },
    ];
    afterEach(() => {
      session.token = "test-token";
    });

    it("makes no request (and no 401) when there is no session token", async () => {
      session.token = null;
      const fakeFetch = vi.fn();
      global.fetch = fakeFetch;
      expect(await fetchAskScholarThreadsFromServer("researcher@scholar.org", { allowInTest: true })).toEqual([]);
      expect(await syncAskScholarThreadsToServer(mockThreads, "researcher@scholar.org", { allowInTest: true })).toBe(false);
      expect(fakeFetch).not.toHaveBeenCalled();
    });
  });

  describe("3. verifyAndEnrichDOIMetadataBatch (Live Crossref & Retraction Checking)", () => {
    it("enriches volume, issue, and page numbers from Crossref API", async () => {
      const fakeFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          message: {
            title: ["Attention Is All You Need"],
            author: [{ given: "Ashish", family: "Vaswani" }],
            "published-print": { "date-parts": [[2017, 12, 6]] },
            volume: "30",
            issue: "4",
            page: "5998-6008",
            publisher: "Curran Associates, Inc.",
          },
        }),
      });
      global.fetch = fakeFetch;

      const rawSources: RawSourceInput[] = [
        {
          title: "Attention Is All You Need",
          authors: ["Vaswani, Ashish"],
          year: 2017,
          doi: "10.5555/unique-batch-test-1",
        },
      ];

      const enriched = await verifyAndEnrichDOIMetadataBatch(rawSources);
      expect(enriched).toHaveLength(1);
      expect(enriched[0].volume).toBe("30");
      expect(enriched[0].issue).toBe("4");
      expect(enriched[0].pages).toBe("5998-6008");
      expect(enriched[0].publisher).toBe("Curran Associates, Inc.");
      expect(enriched[0].isRetracted).toBe(false);
      expect(enriched[0].metadataMismatchWithDoi).toBe(false);
    });

    it("flags retracted papers via update-to notices or retraction indicators", async () => {
      const fakeFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          message: {
            title: ["Retracted: Hydroxychloroquine in Patients with COVID-19"],
            author: [{ given: "Mandeep", family: "Mehra" }],
            "update-to": [{ type: "retraction", updated: { "date-parts": [[2020, 6, 5]] } }],
          },
        }),
      });
      global.fetch = fakeFetch;

      const rawSources: RawSourceInput[] = [
        {
          title: "Hydroxychloroquine in Patients with COVID-19",
          authors: ["Mehra, Mandeep"],
          year: 2020,
          doi: "10.1016/unique-retraction-test-2",
        },
      ];

      const enriched = await verifyAndEnrichDOIMetadataBatch(rawSources);
      expect(enriched).toHaveLength(1);
      expect(enriched[0].isRetracted).toBe(true);
      expect(enriched[0].retractionNotice).toContain("Crossref update-to retraction recorded");
    });

    it("flags DOI mismatches when Crossref title does not overlap with candidate title", async () => {
      const fakeFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          message: {
            title: ["Completely Unrelated Quantum Chemistry Paper"],
            author: [{ given: "John", family: "Doe" }],
          },
        }),
      });
      global.fetch = fakeFetch;

      const rawSources: RawSourceInput[] = [
        {
          title: "Deep Reinforcement Learning for Autonomous Navigation",
          authors: ["Smith, Alice"],
          year: 2023,
          doi: "10.1016/unique-mismatch-test-3",
        },
      ];

      const enriched = await verifyAndEnrichDOIMetadataBatch(rawSources);
      expect(enriched).toHaveLength(1);
      expect(enriched[0].metadataMismatchWithDoi).toBe(true);
    });
  });
});
