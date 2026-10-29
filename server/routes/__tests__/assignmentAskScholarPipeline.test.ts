import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

export const TEST_USER_ID = "22222222-2222-4222-8222-222222222222";
vi.mock("../../src/middleware/auth.ts", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: TEST_USER_ID, email: "coursework.tester@university.ac.uk" };
    next();
  },
}));

vi.mock("../../utils/llm.ts", () => ({
  callOpenRouterJSON: vi.fn(),
  callOpenRouterText: vi.fn(),
  getCandidates: () => [],
  buildAuthorizedPolicy: () => ({}),
  resolveRequestAiConfig: () => ({ candidates: [], isClientConfigured: false }),
}));

vi.mock("../../src/discovery/discovery.ts", () => ({
  discoverMultiPortalSources: vi.fn().mockResolvedValue([
    {
      title: "Attention Is All You Need",
      authors: ["Ashish Vaswani", "Noam Shazeer"],
      year: 2017,
      venue: "Advances in Neural Information Processing Systems",
      doi: "10.48550/arXiv.1706.03762",
      url: "https://arxiv.org/abs/1706.03762",
      discoveredVia: "openalex",
      sourceType: "scholarly",
      authorityTier: "A",
    },
    {
      title: "Deep Residual Learning for Image Recognition",
      authors: ["Kaiming He", "Xiangyu Zhang"],
      year: 2016,
      venue: "IEEE Conference on Computer Vision and Pattern Recognition",
      doi: "10.1109/CVPR.2016.90",
      url: "https://doi.org/10.1109/CVPR.2016.90",
      discoveredVia: "crossref",
      sourceType: "scholarly",
      authorityTier: "A",
    },
  ]),
}));

import request from "supertest";
import { app } from "../../../server.ts";
import { __resetProjectStoreForTests } from "../../../src/app/conductor/projectStore.ts";
import { getProjectStore } from "../../../src/services/store/projectStore.ts";
import { callOpenRouterText } from "../../utils/llm.ts";

process.env.SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_coursework_test";

const originalFetch = global.fetch;

beforeEach(() => {
  __resetProjectStoreForTests();
  vi.clearAllMocks();
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

async function createCourseworkProject(citationStyle = "apa7"): Promise<string> {
  const store = getProjectStore();
  const project = {
    projectId: "proj-coursework-ask-scholar-1",
    ownerId: TEST_USER_ID,
    schemaVersion: 1,
    outputTypeId: "OT-01",
    answers: {
      assignment_title: "Neural Architectures in Academic Coursework",
      assignment_question: "Critically evaluate self-attention mechanisms against residual representations.",
      academic_level: "undergraduate",
      citation_style: citationStyle,
      assignment_type: "essay",
      word_count: 2000,
    },
    gates: [],
    manuscriptJob: null,
    peerReviewHistory: { rounds: [] },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await store.save(project as any);
  return project.projectId;
}

describe("Coursework & Essays (OT-01) Ask Scholar Unified Pipeline", () => {
  describe("1. Unified Evidence & Discovery (POST /research)", () => {
    it("queries OpenAlex/Crossref multi-portal discovery and returns standard bibliographic metadata", async () => {
      const projectId = await createCourseworkProject();

      const fetchCalls: { url: string; body: any }[] = [];
      global.fetch = vi.fn().mockImplementation(async (url: string, init?: any) => {
        const body = init?.body ? JSON.parse(init.body) : null;
        fetchCalls.push({ url: url.toString(), body });
        return new Response(JSON.stringify([]), { status: 200 });
      });

      const res = await request(app)
        .post(`/api/projects/${projectId}/assignment/research`)
        .send({
          question: "Critically evaluate self-attention mechanisms against residual representations.",
          citationStyle: "apa7",
        });

      expect(res.status).toBe(200);
      expect(res.body.sources).toBeDefined();
      expect(Array.isArray(res.body.sources)).toBe(true);
      expect(res.body.sources.length).toBe(2);

      const s1 = res.body.sources[0];
      expect(s1.title).toBe("Attention Is All You Need");
      expect(s1.authors).toEqual(["Ashish Vaswani", "Noam Shazeer"]);
      expect(s1.year).toBe("2017");
      expect(s1.doi).toBe("10.48550/arXiv.1706.03762");
      expect(s1.journal).toBe("Advances in Neural Information Processing Systems");
      expect(s1.retrievalSource).toBe("openalex");
      expect(s1.peerReviewed).toBe(true);

      const s2 = res.body.sources[1];
      expect(s2.title).toBe("Deep Residual Learning for Image Recognition");
      expect(s2.retrievalSource).toBe("crossref");
    });
  });

  describe("2. Deterministic Token Interceptor (POST /draft-section)", () => {
    const approvedEvidence = [
      {
        id: "ev-vaswani-2017",
        source_id: "src-1",
        claim: "Self-attention replaces recurrence completely",
        evidenceSnippet: "The Transformer allows significantly more parallelization",
        citation: "Vaswani et al. (2017)",
        authors: ["Ashish Vaswani", "Noam Shazeer"],
        year: 2017,
        venue: "NeurIPS",
      },
      {
        id: "ev-he-2016",
        source_id: "src-2",
        claim: "Residual connections prevent gradient degradation",
        evidenceSnippet: "Deep residual nets are easier to optimize",
        citation: "He et al. (2016)",
        authors: ["Kaiming He", "Xiangyu Zhang"],
        year: 2016,
        venue: "CVPR",
      },
    ];

    it("intercepts bracket tokens [1] and [ev-uuid] and compiles deterministic APA citations", async () => {
      const projectId = await createCourseworkProject("apa7");

      // Mock LLM output that strictly used bracket tokens and hallucinated a bibliography
      const llmOutput = `Recent architectural paradigms demonstrate that self-attention optimizes representations [1].
Furthermore, residual skip connections stabilize optimization trajectories across deep topologies [ev-he-2016].
Both architectures scale effectively [1, 2].

## References
1. Vaswani, Fake et al., 2017. Hallucinated Reference.
2. He, Fake et al., 2016. Hallucinated Reference.`;

      vi.mocked(callOpenRouterText).mockResolvedValue(llmOutput);

      const res = await request(app)
        .post(`/api/projects/${projectId}/assignment/draft-section`)
        .send({
          sectionTitle: "Theoretical Foundations of Transformer Architectures",
          sectionGuidance: "Evaluate attention and residual mechanisms",
          citationStyle: "apa",
          approvedEvidence,
        });

      expect(res.status).toBe(200);
      expect(res.body.draft).toBeDefined();

      const draft: string = res.body.draft;

      // 1. Prohibits hallucinated bibliography: ## References must be stripped
      expect(draft.includes("## References")).toBe(false);
      expect(draft.includes("Hallucinated Reference")).toBe(false);

      // 2. Intercepts [1] with authentic deterministic APA citation
      expect(draft).toContain("(Vaswani, A. & Shazeer, N., 2017)");

      // 3. Intercepts [ev-he-2016] with authentic deterministic APA citation
      expect(draft).toContain("(He, K. & Zhang, X., 2016)");

      // 4. Intercepts compound token [1, 2]
      expect(draft).toContain("(Vaswani, A. & Shazeer, N., 2017; He, K. & Zhang, X., 2016)");
    });

    it("intercepts bracket tokens into IEEE numeric style [1], [2] when selected", async () => {
      const projectId = await createCourseworkProject("ieee");

      const llmOutput = `Attention networks [1] and residual topologies [ev-he-2016] both resolve scalability limits.`;
      vi.mocked(callOpenRouterText).mockResolvedValue(llmOutput);

      const res = await request(app)
        .post(`/api/projects/${projectId}/assignment/draft-section`)
        .send({
          sectionTitle: "Comparative Performance",
          citationStyle: "ieee",
          approvedEvidence,
        });

      expect(res.status).toBe(200);
      const draft: string = res.body.draft;
      expect(draft).toContain("[1]");
      expect(draft).toContain("[2]");
      expect(draft.includes("(Vaswani")).toBe(false);
    });

    it("intercepts bracket tokens into MLA9 style (author only, no year)", async () => {
      const projectId = await createCourseworkProject("mla");

      const llmOutput = `The self-attention mechanism [1] fundamentally transformed sequence transduction.`;
      vi.mocked(callOpenRouterText).mockResolvedValue(llmOutput);

      const res = await request(app)
        .post(`/api/projects/${projectId}/assignment/draft-section`)
        .send({
          sectionTitle: "Architecture Review",
          citationStyle: "mla",
          approvedEvidence,
        });

      expect(res.status).toBe(200);
      const draft: string = res.body.draft;
      expect(draft).toContain("(Vaswani)");
      expect(draft.includes("2017")).toBe(false);
    });
  });

  describe("3. SSE Streaming Pipeline (POST /stream-section)", () => {
    it("streams intercepted prose and emits deterministic fullText without raw references", async () => {
      const projectId = await createCourseworkProject("apa7");

      const llmOutput = `Empirical evaluations confirm model convergence [1].

### References
1. Fake Hallucinated References List`;

      vi.mocked(callOpenRouterText).mockResolvedValue(llmOutput);

      const boundSources = [
        {
          id: "src-1",
          title: "Attention Is All You Need",
          authors: ["Ashish Vaswani", "Noam Shazeer"],
          year: 2017,
          venue: "NeurIPS",
        },
      ];

      const res = await request(app)
        .post(`/api/projects/${projectId}/assignment/stream-section`)
        .send({
          sectionTitle: "Empirical Analysis",
          citationStyle: "apa",
          boundSources,
        });

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("text/event-stream");

      const sseText = res.text;
      expect(sseText).toContain("data: ");
      expect(sseText).toContain("[DONE]");

      // Extract fullText event
      const fullTextMatch = sseText.match(/data:\s*(\{"fullText":[\s\S]*?\})\n\n/);
      expect(fullTextMatch).toBeTruthy();

      const parsed = JSON.parse(fullTextMatch![1]);
      expect(parsed.fullText).toBeDefined();
      expect(parsed.fullText).toContain("(Vaswani, A. & Shazeer, N., 2017)");
      expect(parsed.fullText.includes("Fake Hallucinated References List")).toBe(false);
    });
  });

  describe("1b. No invented fallback sources (POST /research)", () => {
    it("returns and saves an empty list when live discovery finds nothing", async () => {
      const { discoverMultiPortalSources } = await import("../../src/discovery/discovery.ts");
      vi.mocked(discoverMultiPortalSources).mockResolvedValueOnce([]);
      const projectId = await createCourseworkProject();

      const res = await request(app)
        .post(`/api/projects/${projectId}/assignment/research`)
        .send({ question: "An obscure question no index can answer", citationStyle: "apa7" });

      expect(res.status).toBe(200);
      expect(res.body.sources).toEqual([]);
    });

    it("returns an empty list when live discovery errors", async () => {
      const { discoverMultiPortalSources } = await import("../../src/discovery/discovery.ts");
      vi.mocked(discoverMultiPortalSources).mockRejectedValueOnce(new Error("network down"));
      const projectId = await createCourseworkProject();

      const res = await request(app)
        .post(`/api/projects/${projectId}/assignment/research`)
        .send({ question: "Critically evaluate algorithmic governance", citationStyle: "apa7" });

      expect(res.status).toBe(200);
      expect(res.body.sources).toEqual([]);
    });
  });

  describe("4. Citation Grounding (POST /citations-ground)", () => {
    it("returns no citations (and never asks an LLM to write some) when discovery finds nothing", async () => {
      const { discoverMultiPortalSources } = await import("../../src/discovery/discovery.ts");
      const { callOpenRouterJSON } = await import("../../utils/llm.ts");
      vi.mocked(discoverMultiPortalSources).mockResolvedValueOnce([]);
      const projectId = await createCourseworkProject("apa7");
      const res = await request(app)
        .post(`/api/projects/${projectId}/assignment/citations-ground`)
        .send({ question: "Nothing indexes this", citationStyle: "apa" });
      expect(res.status).toBe(200);
      expect(res.body.citations).toEqual([]);
      expect(callOpenRouterJSON).not.toHaveBeenCalled();
    });

    it("returns verified multi-portal scholarly sources with deterministic citations", async () => {
      const projectId = await createCourseworkProject("apa7");

      const res = await request(app)
        .post(`/api/projects/${projectId}/assignment/citations-ground`)
        .send({
          question: "Neural representations in machine learning",
          citationStyle: "apa",
        });

      expect(res.status).toBe(200);
      expect(res.body.citations).toBeDefined();
      expect(Array.isArray(res.body.citations)).toBe(true);
      expect(res.body.citations.length).toBeGreaterThan(0);

      const c1 = res.body.citations[0];
      expect(c1.sourceTitle).toBe("Attention Is All You Need");
      expect(c1.authors).toContain("Ashish Vaswani");
      expect(c1.year).toBe("2017");
      expect(c1.citationText).toContain("Attention Is All You Need");
      expect(c1.inTextCitation).toContain("Vaswani");
      expect(c1.verifiedPeerReviewed).toBe(true);
    });
  });
});
