import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import type { KnowledgeVault, VaultFile, VaultChunk, VaultFileOverview } from "../../types";
import {
  searchVaultContext,
  isVaultActive,
  getActiveVaultContext,
  buildCitationPrompt,
  getRelevantChunksContext,
} from "../knowledgeVaultService";

function overview(overrides: Partial<VaultFileOverview> = {}): VaultFileOverview {
  return {
    title: "A Great Paper",
    abstract: "An abstract about important things.",
    author: "Jane Smith",
    citationTag: "Smith (2021)",
    chapters: [],
    keyTerms: [],
    ...overrides,
  };
}

function chunk(overrides: Partial<VaultChunk> = {}): VaultChunk {
  return {
    id: "chunk-1",
    fileId: "file-1",
    content: "Some chunk content about research methodology and findings.",
    sectionHint: "Body",
    index: 0,
    ...overrides,
  };
}

function file(overrides: Partial<VaultFile> = {}): VaultFile {
  return {
    id: "file-1",
    fileName: "paper.pdf",
    fileType: "pdf",
    fileSize: 1000,
    uploadedAt: new Date().toISOString(),
    isActive: true,
    status: "ready",
    extractedText: "",
    chunks: [],
    charCount: 0,
    ...overrides,
  };
}

describe("knowledgeVaultService.ts - isVaultActive", () => {
  it("returns false for undefined vault", () => {
    expect(isVaultActive(undefined)).toBe(false);
  });

  it("returns false for a vault with no files", () => {
    expect(isVaultActive({ files: [], lastUpdated: "" })).toBe(false);
  });

  it("returns false when no file is both active and ready", () => {
    const vault: KnowledgeVault = {
      files: [file({ isActive: false, status: "ready" }), file({ isActive: true, status: "processing" })],
      lastUpdated: "",
    };
    expect(isVaultActive(vault)).toBe(false);
  });

  it("returns true when at least one file is active and ready", () => {
    const vault: KnowledgeVault = {
      files: [file({ isActive: false }), file({ isActive: true, status: "ready" })],
      lastUpdated: "",
    };
    expect(isVaultActive(vault)).toBe(true);
  });
});

describe("knowledgeVaultService.ts - getActiveVaultContext", () => {
  it("returns empty string for undefined vault", () => {
    expect(getActiveVaultContext(undefined)).toBe("");
  });

  it("returns empty string when no active/ready files exist", () => {
    expect(getActiveVaultContext({ files: [file({ isActive: false })], lastUpdated: "" })).toBe("");
  });

  it("builds context text including title, author, citation tag, and abstract for active files", () => {
    const vault: KnowledgeVault = {
      files: [file({ parsedOverview: overview() })],
      lastUpdated: "",
    };
    const ctx = getActiveVaultContext(vault);
    expect(ctx).toContain("A Great Paper");
    expect(ctx).toContain("Jane Smith");
    expect(ctx).toContain("Smith (2021)");
    expect(ctx).toContain("An abstract about important things.");
  });

  it("skips files that are active/ready but have no parsedOverview", () => {
    const vault: KnowledgeVault = {
      files: [file({ parsedOverview: undefined })],
      lastUpdated: "",
    };
    const ctx = getActiveVaultContext(vault);
    // Still emits the wrapper text, but no per-file details since overview is undefined
    expect(ctx).toContain("KNOWLEDGE VAULT");
    expect(ctx).not.toContain("Title:");
  });

  it("includes chapters and key terms when present", () => {
    const vault: KnowledgeVault = {
      files: [
        file({
          parsedOverview: overview({
            chapters: [{ name: "Intro", summary: "Sets the stage." }],
            keyTerms: ["ai", "research"],
          }),
        }),
      ],
      lastUpdated: "",
    };
    const ctx = getActiveVaultContext(vault);
    expect(ctx).toContain("Intro: Sets the stage.");
    expect(ctx).toContain("Key Terms: ai, research");
  });

  it("excludes inactive or non-ready files from the context", () => {
    const vault: KnowledgeVault = {
      files: [
        file({ isActive: true, status: "ready", parsedOverview: overview({ title: "Included Paper" }) }),
        file({ id: "f2", isActive: false, parsedOverview: overview({ title: "Excluded Paper" }) }),
      ],
      lastUpdated: "",
    };
    const ctx = getActiveVaultContext(vault);
    expect(ctx).toContain("Included Paper");
    expect(ctx).not.toContain("Excluded Paper");
  });
});

describe("knowledgeVaultService.ts - buildCitationPrompt", () => {
  it("returns empty string for undefined vault or no active files", () => {
    expect(buildCitationPrompt(undefined)).toBe("");
    expect(buildCitationPrompt({ files: [], lastUpdated: "" })).toBe("");
  });

  it("includes citation tags and file names for active files", () => {
    const vault: KnowledgeVault = {
      files: [file({ fileName: "important.pdf", parsedOverview: overview({ citationTag: "Doe (2020)" }) })],
      lastUpdated: "",
    };
    const prompt = buildCitationPrompt(vault);
    expect(prompt).toContain("Doe (2020)");
    expect(prompt).toContain('"important.pdf"');
    expect(prompt).toMatch(/MANDATORY RULES/);
  });

  it("falls back to fileName as the citation tag when parsedOverview is absent", () => {
    const vault: KnowledgeVault = {
      files: [file({ fileName: "no-overview.pdf", parsedOverview: undefined })],
      lastUpdated: "",
    };
    const prompt = buildCitationPrompt(vault);
    expect(prompt).toContain("no-overview.pdf");
  });
});

describe("knowledgeVaultService.ts - searchVaultContext (keyword-overlap RAG scoring)", () => {
  it("returns [] when vault is undefined or has no files", () => {
    expect(searchVaultContext("query", undefined)).toEqual([]);
    expect(searchVaultContext("query", { files: [], lastUpdated: "" })).toEqual([]);
  });

  it("returns [] when no active/ready files have chunks", () => {
    const vault: KnowledgeVault = { files: [file({ isActive: false, chunks: [chunk()] })], lastUpdated: "" };
    expect(searchVaultContext("query", vault)).toEqual([]);
  });

  it("returns [] when no chunk matches any query term (score 0 excluded)", () => {
    const vault: KnowledgeVault = {
      files: [file({ chunks: [chunk({ content: "Completely unrelated content about cooking recipes." })] })],
      lastUpdated: "",
    };
    expect(searchVaultContext("quantum physics experiments", vault)).toEqual([]);
  });

  it("ranks chunks by keyword overlap score, best match first", () => {
    const vault: KnowledgeVault = {
      files: [
        file({
          chunks: [
            chunk({ id: "low", content: "This chunk mentions methodology once." }),
            chunk({ id: "high", content: "Methodology methodology methodology and more methodology details." }),
          ],
        }),
      ],
      lastUpdated: "",
    };
    const results = searchVaultContext("methodology", vault, 5);
    expect(results.length).toBe(2);
    expect(results[0].id).toBe("high");
    expect(results[1].id).toBe("low");
  });

  it("ignores query terms with length <= 3", () => {
    const vault: KnowledgeVault = {
      files: [file({ chunks: [chunk({ content: "Something about the sky and the sea." })] })],
      lastUpdated: "",
    };
    // "sky"/"sea" are length 3, filtered out entirely -> no terms -> score 0 -> []
    expect(searchVaultContext("sky sea", vault)).toEqual([]);
  });

  it("respects the topK limit", () => {
    const manyChunks = Array.from({ length: 10 }, (_, i) =>
      chunk({ id: `c${i}`, content: `Research research research chunk number ${i}` })
    );
    const vault: KnowledgeVault = { files: [file({ chunks: manyChunks })], lastUpdated: "" };
    const results = searchVaultContext("research", vault, 3);
    expect(results.length).toBe(3);
  });
});

describe("knowledgeVaultService.ts - getRelevantChunksContext", () => {
  it("returns empty string when no chunks match", () => {
    const vault: KnowledgeVault = { files: [file({ chunks: [chunk({ content: "unrelated" })] })], lastUpdated: "" };
    expect(getRelevantChunksContext("nonexistent topic here", vault)).toBe("");
  });

  it("builds excerpt context with file name, citation tag, section hint, and content", () => {
    const vault: KnowledgeVault = {
      files: [
        file({
          id: "f1",
          fileName: "source.pdf",
          parsedOverview: overview({ citationTag: "Ref (2022)" }),
          chunks: [chunk({ fileId: "f1", content: "Detailed methodology discussion here.", sectionHint: "Methodology" })],
        }),
      ],
      lastUpdated: "",
    };
    const ctx = getRelevantChunksContext("methodology discussion", vault);
    expect(ctx).toContain("source.pdf");
    expect(ctx).toContain("Ref (2022)");
    expect(ctx).toContain("Methodology");
    expect(ctx).toContain("Detailed methodology discussion here.");
  });

  it("falls back to 'Unknown Source' when the chunk's file cannot be found in the vault", () => {
    const vault: KnowledgeVault = {
      files: [file({ id: "f1", chunks: [chunk({ fileId: "does-not-exist-in-files", content: "Findable methodology text." })] })],
      lastUpdated: "",
    };
    const ctx = getRelevantChunksContext("methodology", vault);
    expect(ctx).toContain("Unknown Source");
  });
});

// ============================================================================
// Network-boundary tests for uploadAndProcessFile: mocks global fetch (the
// /api/parse-file server call) and the AIGateway module (AI overview
// extraction) at the narrowest boundary possible, per this project's
// convention of not mocking the whole service. Confirms the error-handling
// contract (parse failure, too-short extracted text) and that an AI-overview
// failure degrades to the deterministic fallback overview rather than
// crashing the whole upload - a realistic production failure mode for a
// file-upload pipeline calling out to two different network dependencies.
// ============================================================================
vi.mock("../aiGateway", () => ({
  default: { generate: vi.fn(), generateStream: vi.fn() },
}));

import AIGateway from "../aiGateway";
import { uploadAndProcessFile } from "../knowledgeVaultService";

function makeFile(content: string, name = "test.txt", type = "text/plain"): File {
  return new File([content], name, { type });
}

describe("knowledgeVaultService.ts - uploadAndProcessFile (network boundary)", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("throws when the parse-file server endpoint responds with a non-ok status", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Unsupported file type" }),
    }) as any;

    await expect(
      uploadAndProcessFile(makeFile("hello"), { provider: "gemini" } as any)
    ).rejects.toThrow("Unsupported file type");
  });

  it("throws when the extracted text is too short to be meaningful", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: "short" }),
    }) as any;

    await expect(
      uploadAndProcessFile(makeFile("hello"), { provider: "gemini" } as any)
    ).rejects.toThrow("Could not extract meaningful text");
  });

  it("falls back to a deterministic overview when AI overview extraction fails, instead of crashing the upload", async () => {
    const longText = "This is a long academic document. ".repeat(20);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: longText, metadata: { extension: "txt" } }),
    }) as any;
    (AIGateway.generate as any).mockRejectedValue(new Error("AI Gateway unavailable"));

    const result = await uploadAndProcessFile(makeFile(longText, "my-paper.txt"), { provider: "gemini" } as any);

    expect(result.status).toBe("ready");
    expect(result.parsedOverview).toBeDefined();
    expect(result.parsedOverview?.author).toBe("Academic Researcher");
    expect(result.chunks.length).toBeGreaterThan(0);
  });

  it("uses the AI-extracted overview and computes a deterministic citation tag from the extracted author/year", async () => {
    const longText = "This is a long academic document about important research topics. ".repeat(20);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: longText, metadata: { extension: "txt" } }),
    }) as any;
    (AIGateway.generate as any).mockResolvedValue({
      text: JSON.stringify({
        title: "AI Extracted Title",
        abstract: "AI abstract",
        author: "Smith, John",
        year: "2023",
        institutionOrJournal: "Some University",
        volumeIssue: "",
        doiOrUrl: "",
        chapters: [],
        keyTerms: ["a", "b"],
        citationTag: "will be overwritten deterministically",
      }),
      provider: "gemini",
      model: "test",
      inputWords: 1,
      outputWords: 1,
    });

    const result = await uploadAndProcessFile(makeFile(longText, "ai-paper.txt"), { provider: "gemini" } as any);
    expect(result.parsedOverview?.title).toBe("AI Extracted Title");
    // Citation tag is recomputed deterministically from author+year, not trusted from the AI's own attempt.
    expect(result.parsedOverview?.citationTag).toBe("Smith (2023)");
  });
});
