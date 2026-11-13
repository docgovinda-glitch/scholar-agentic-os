// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, within, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import {
  ASK_SCHOLAR_CITATION_STYLES,
  getCitationStyleInfo,
  formatAskScholarInText,
  formatAskScholarBibliography,
  extractDoi,
  stripRawReferencesSection,
  replaceBracketTokensWithDeterministicCitations,
  compileDeterministicBibliographyMarkdown,
  type WebsiteCitationItem,
} from "../scholarCitationEngine.ts";
import ProjectListScreen from "../ProjectListScreen.tsx";

const listOutputTypes = vi.fn().mockResolvedValue({ items: [] });
const listProjects = vi.fn().mockResolvedValue({ items: [] });
const executeAgenticQuery = vi.fn().mockResolvedValue({ ok: true, text: "Mock academic response" });
const getAiOperationalStatus = vi.fn().mockResolvedValue({ connected: true, statusText: "AI Ready" });

vi.mock("../api", () => ({
  createProject: vi.fn(),
  listOutputTypes: (...a: unknown[]) => listOutputTypes(...a),
  listProjects: (...a: unknown[]) => listProjects(...a),
  deleteProject: vi.fn(),
  saveIntakeAnswers: vi.fn(),
  executeAgenticLLM: vi.fn(),
  executeAgenticQuery: (...a: unknown[]) => executeAgenticQuery(...a),
  getAiOperationalStatus: (...a: unknown[]) => getAiOperationalStatus(...a),
  parseFileForAgent: vi.fn(),
}));

vi.mock("../../services/supabaseClient", () => ({
  getSupabaseClient: () => ({
    auth: {
      signOut: vi.fn(),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  }),
  isSupabaseConfigured: () => true,
}));

describe("Ask Scholar Citation Engine & Referencing System", () => {
  const sampleCitations: WebsiteCitationItem[] = [
    {
      title: "Attention Is All You Need",
      authors: ["Ashish Vaswani", "Noam Shazeer", "Niki Parmar", "Jakob Uszkoreit"],
      year: 2017,
      venue: "Advances in Neural Information Processing Systems",
      doi: "10.48550/arXiv.1706.03762",
      url: "https://arxiv.org/abs/1706.03762",
      snippet: "The dominant sequence transduction models are based on complex recurrent or convolutional neural networks.",
    },
    {
      title: "Deep Residual Learning for Image Recognition",
      authors: ["Kaiming He", "Xiangyu Zhang", "Shaoqing Ren", "Jian Sun"],
      year: 2016,
      venue: "IEEE Conference on Computer Vision and Pattern Recognition",
      doi: "10.1109/CVPR.2016.90",
      url: "https://doi.org/10.1109/CVPR.2016.90",
      snippet: "Deeper neural networks are more difficult to train.",
    },
  ];

  afterEach(() => {
    cleanup();
  });

  it("supports all 6 required citation styles", () => {
    const requiredStyles = ["apa", "mla", "chicago", "harvard", "ieee", "vancouver"];
    const availableIds = ASK_SCHOLAR_CITATION_STYLES.map((s) => s.id);

    requiredStyles.forEach((style) => {
      expect(availableIds).toContain(style);
    });

    expect(getCitationStyleInfo("apa").shortLabel).toBe("APA 7th");
    expect(getCitationStyleInfo("mla").shortLabel).toBe("MLA 9th");
    expect(getCitationStyleInfo("chicago").shortLabel).toBe("Chicago");
    expect(getCitationStyleInfo("harvard").shortLabel).toBe("Harvard");
    expect(getCitationStyleInfo("ieee").shortLabel).toBe("IEEE");
    expect(getCitationStyleInfo("vancouver").shortLabel).toBe("Vancouver");
  });

  describe("In-text Citation Formatting", () => {
    it("formats APA in-text citations with author and year", () => {
      const inText = formatAskScholarInText(sampleCitations[0], 0, "apa");
      expect(inText).toContain("Vaswani");
      expect(inText).toContain("2017");
      expect(inText.startsWith("(")).toBe(true);
      expect(inText.endsWith(")")).toBe(true);
    });

    it("formats MLA in-text citations with author", () => {
      const inText = formatAskScholarInText(sampleCitations[0], 0, "mla");
      expect(inText).toContain("Vaswani");
      expect(inText.startsWith("(")).toBe(true);
      expect(inText.endsWith(")")).toBe(true);
    });

    it("formats Chicago in-text citations with author and year", () => {
      const inText = formatAskScholarInText(sampleCitations[0], 0, "chicago");
      expect(inText).toContain("Vaswani");
      expect(inText).toContain("2017");
    });

    it("formats Harvard in-text citations with author and year", () => {
      const inText = formatAskScholarInText(sampleCitations[0], 0, "harvard");
      expect(inText).toContain("Vaswani");
      expect(inText).toContain("2017");
    });

    it("formats IEEE in-text citations with square numeric brackets [1]", () => {
      const inText1 = formatAskScholarInText(sampleCitations[0], 0, "ieee");
      const inText2 = formatAskScholarInText(sampleCitations[1], 1, "ieee");
      expect(inText1).toBe("[1]");
      expect(inText2).toBe("[2]");
    });

    it("formats Vancouver in-text citations with numeric markers", () => {
      const inText1 = formatAskScholarInText(sampleCitations[0], 0, "vancouver");
      const inText2 = formatAskScholarInText(sampleCitations[1], 1, "vancouver");
      expect(inText1).toBe("(1)");
      expect(inText2).toBe("(2)");
    });
  });

  describe("Bibliography & Reference List Generation", () => {
    it("generates authentic references with DOIs and links in APA style", () => {
      const bib = formatAskScholarBibliography(sampleCitations, "apa");
      expect(bib.length).toBe(2);

      const vaswaniEntry = bib.find((e) => e.formattedText.includes("Attention Is All You Need"));
      expect(vaswaniEntry).toBeDefined();
      expect(vaswaniEntry?.formattedText).toContain("Vaswani");
      expect(vaswaniEntry?.doi).toContain("10.48550/arXiv.1706.03762");
      expect(vaswaniEntry?.url).toBeTruthy();
    });

    it("orders references alphabetically by author surname for author-date styles", () => {
      const bib = formatAskScholarBibliography(sampleCitations, "apa");
      expect(bib[0].formattedText).toContain("He");
      expect(bib[1].formattedText).toContain("Vaswani");
    });

    it("preserves sequential appearance order for IEEE and Vancouver", () => {
      const bibIeee = formatAskScholarBibliography(sampleCitations, "ieee");
      expect(bibIeee[0].marker).toBe("[1]");
      expect(bibIeee[1].marker).toBe("[2]");
      expect(bibIeee[0].formattedText).toContain("Vaswani");
      expect(bibIeee[1].formattedText).toContain("He");

      const bibVan = formatAskScholarBibliography(sampleCitations, "vancouver");
      expect(bibVan[0].marker).toBe("(1)");
      expect(bibVan[1].marker).toBe("(2)");
      expect(bibVan[0].formattedText).toContain("Vaswani");
    });

    it("extracts DOIs correctly from URLs or raw strings", () => {
      expect(extractDoi("https://doi.org/10.1038/s41586-020-2649-2")).toBe("10.1038/s41586-020-2649-2");
      expect(extractDoi("10.1145/3357384.3357999")).toBe("10.1145/3357384.3357999");
      expect(extractDoi("https://example.com/paper.pdf")).toBeUndefined();
    });

    it("strips raw repetitive markdown references section cleanly", () => {
      const rawText = "Recent findings show high efficacy [1].\n\n### References\n1. Vaswani et al. 2017\n2. He et al. 2016";
      const cleaned = stripRawReferencesSection(rawText);
      expect(cleaned).toBe("Recent findings show high efficacy [1].");
    });
  });

  describe("Deterministic Bracket Token Interceptor", () => {
    const testSources: WebsiteCitationItem[] = [
      {
        id: "ev-vaswani-2017",
        title: "Attention Is All You Need",
        authors: ["Ashish Vaswani", "Noam Shazeer"],
        year: 2017,
        journal: "Advances in Neural Information Processing Systems",
        doi: "10.48550/arXiv.1706.03762",
      },
      {
        id: "ev-he-2016",
        title: "Deep Residual Learning for Image Recognition",
        authors: ["Kaiming He", "Xiangyu Zhang"],
        year: 2016,
        journal: "IEEE CVPR",
        doi: "10.1109/CVPR.2016.90",
      },
    ];

    it("replaces numeric bracket tokens [1] with APA author-date format", () => {
      const input = "Transformers replace recurrence [1].";
      const result = replaceBracketTokensWithDeterministicCitations(input, testSources, "apa");
      expect(result).toBe("Transformers replace recurrence (Vaswani & Shazeer, 2017).");
    });

    it("replaces compound bracket tokens [1, 2] with combined APA citation", () => {
      const input = "Both paradigms scale effectively [1, 2].";
      const result = replaceBracketTokensWithDeterministicCitations(input, testSources, "apa");
      expect(result).toBe("Both paradigms scale effectively (Vaswani & Shazeer, 2017; He & Zhang, 2016).");
    });

    it("replaces identifier bracket tokens [ev-uuid] with APA citations", () => {
      const input = "Residual architectures stabilize gradient flow [ev-he-2016].";
      const result = replaceBracketTokensWithDeterministicCitations(input, testSources, "apa");
      expect(result).toBe("Residual architectures stabilize gradient flow (He & Zhang, 2016).");
    });

    it("preserves IEEE bracket numbering for numeric and identifier tokens", () => {
      const input = "Models scale [1] and converge [ev-he-2016].";
      const result = replaceBracketTokensWithDeterministicCitations(input, testSources, "ieee");
      expect(result).toBe("Models scale [1] and converge [2].");
    });

    it("formats MLA9 in-text citations without publication year", () => {
      const input = "The self-attention mechanism [1] fundamentally transformed NLP.";
      const result = replaceBracketTokensWithDeterministicCitations(input, testSources, "mla");
      expect(result).toBe("The self-attention mechanism (Vaswani and Shazeer) fundamentally transformed NLP.");
    });

    it("retains standard Markdown hyperlinks without corruption", () => {
      const input = "Refer to the [official repo](https://github.com/scholar) and evidence [1].";
      const result = replaceBracketTokensWithDeterministicCitations(input, testSources, "apa");
      expect(result).toContain("[official repo](https://github.com/scholar)");
      expect(result).toContain("(Vaswani & Shazeer, 2017)");
    });

    it("strips raw LLM hallucinated references and compiles deterministic bibliography", () => {
      const hallucinated = "Modern NLP models [1].\n\n## References\n1. Vaswani fake entry 2017";
      const interceptedProse = replaceBracketTokensWithDeterministicCitations(hallucinated, testSources, "apa");
      expect(interceptedProse).toBe("Modern NLP models (Vaswani & Shazeer, 2017).");

      const compiledBib = compileDeterministicBibliographyMarkdown(testSources, "apa");
      expect(compiledBib).toContain("## References");
      expect(compiledBib).toContain("Attention Is All You Need");
      expect(compiledBib).toContain("Deep Residual Learning");
    });
  });

  describe("UI Integration in ProjectListScreen", () => {
    beforeEach(() => {
      localStorage.clear();
      vi.clearAllMocks();
    });

    it("ensures 'Suggested Research Inquiries' UI is completely removed", async () => {
      render(
        <MemoryRouter>
          <ProjectListScreen
            onOpen={vi.fn()}
            userEmail="researcher@university.edu"
            onOpenAiAccess={vi.fn()}
          />
        </MemoryRouter>
      );

      // Open Ask Scholar Assistant Sidebar
      const openButtons = screen.getAllByRole("button", { name: /Ask Scholar|AI Assistant/i });
      if (openButtons.length > 0) {
        fireEvent.click(openButtons[0]);
      }

      // Assert that "Suggested Research Inquiries" does not exist anywhere in DOM
      expect(screen.queryByText(/Suggested Research Inquiries/i)).toBeNull();
      expect(screen.queryByText(/Neural-symbolic reasoning/i)).toBeNull();
      expect(screen.queryByText(/Prime editing trials/i)).toBeNull();
    });

    it("provides referencing style selector with APA, MLA, Chicago, Harvard, IEEE, Vancouver", async () => {
      render(
        <MemoryRouter>
          <ProjectListScreen
            onOpen={vi.fn()}
            userEmail="researcher@university.edu"
            onOpenAiAccess={vi.fn()}
          />
        </MemoryRouter>
      );

      // Open sidebar
      const openButtons = screen.getAllByRole("button", { name: /Ask Scholar|AI Assistant/i });
      if (openButtons.length > 0) {
        fireEvent.click(openButtons[0]);
      }

      // The style picker (was a bare <select>) lists each style with how an
      // in-text citation looks, grouped author–date / numbered.
      const picker = screen.getByRole("button", { name: /Referencing style:/i });
      fireEvent.click(picker);
      const listbox = screen.getByRole("listbox", { name: "Referencing style" });
      const names = within(listbox).getAllByRole("option").map((o) => o.textContent);
      for (const n of ["APA", "MLA", "Chicago", "Harvard", "IEEE", "Vancouver"]) expect(names.some((t) => t?.includes(n))).toBe(true);
      expect(within(listbox).getByRole("option", { name: /Harvard Referencing.*\(Vaswani, 2017\)/ })).toBeInTheDocument();

      // User selects IEEE
      fireEvent.click(within(listbox).getByRole("option", { name: /^IEEE/ }));
      expect(JSON.parse(localStorage.getItem("scholar_ask_user_settings_v1") || "{}").preferredCitationStyle).toBe("ieee");
      expect(screen.getByRole("button", { name: /Referencing style: IEEE/i })).toBeInTheDocument();

      // User switches to Harvard
      fireEvent.click(screen.getByRole("button", { name: /Referencing style:/i }));
      fireEvent.click(screen.getByRole("option", { name: /^Harvard/ }));
      expect(JSON.parse(localStorage.getItem("scholar_ask_user_settings_v1") || "{}").preferredCitationStyle).toBe("harvard");
    });
  });
});
