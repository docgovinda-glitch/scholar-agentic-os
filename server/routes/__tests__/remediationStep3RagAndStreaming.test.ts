import { describe, it, expect } from "vitest";
import {
  chunkAcademicDocument,
  retrieveTopKChunks,
  generateRollingPriorChapterSummary,
  buildBoundedRagContext,
  detectChunkStance,
  estimateTokens,
  type AcademicDocumentInput,
  type PriorChapter,
} from "../../src/services/semanticRagEngine.ts";
import { scholarBrain } from "../../src/services/scholarBrain.ts";

describe("Remediation Step 3: Hierarchical Semantic Chunking, Hybrid Reranker & SSE Streaming", () => {
  describe("1. Hierarchical Semantic Chunker (chunkAcademicDocument)", () => {
    it("chunks academic papers into bounded blocks preserving paragraph and sentence boundaries", () => {
      const doc: AcademicDocumentInput = {
        id: "vaswani-2017",
        title: "Attention Is All You Need",
        author: "Vaswani et al.",
        year: 2017,
        content: `## Abstract
The dominant sequence transduction models are based on complex recurrent or convolutional neural networks. We propose the Transformer, a model architecture eschewing recurrence and instead relying entirely on an attention mechanism to draw global dependencies between input and output.

## Methodological Architecture
The Transformer follows this overall architecture using stacked self-attention and point-wise, fully connected layers for both the encoder and decoder. The encoder is composed of a stack of N = 6 identical layers. Each layer has two sub-layers. The first is a multi-head self-attention mechanism, and the second is a simple, position-wise fully connected feed-forward network. We employ a residual connection around each of the two sub-layers, followed by layer normalization.

## Experimental Results
On the WMT 2014 English-to-German translation task, the big transformer model establishes a new state-of-the-art BLEU score of 28.4. On the English-to-French translation task, our model achieves a score of 41.8 after training for 3.5 days on eight GPUs.`,
      };

      const chunks = chunkAcademicDocument(doc);
      expect(chunks.length).toBeGreaterThanOrEqual(2);

      for (const chunk of chunks) {
        // Must preserve attribution tag
        expect(chunk.attributionTag).toBe("[CITE:vaswani-2017]");
        expect(chunk.text).toContain("[CITE:vaswani-2017]");

        // Must contain hierarchical breadcrumb
        expect(chunk.breadcrumb).toContain("Attention Is All You Need");

        // Must not truncate mid-sentence (ends with punctuation or bracket)
        const trimmed = chunk.text.trim();
        const lastChar = trimmed[trimmed.length - 1];
        expect([".", "!", "?", "]", ")"]).toContain(lastChar);

        // Word count should be bounded
        expect(chunk.wordCount).toBeLessThanOrEqual(400);
      }
    });

    it("extracts multiple sections and preserves markdown heading breadcrumbs", () => {
      const doc: AcademicDocumentInput = {
        id: "epistemic-protocol",
        title: "Triangulated Multi-Agent Verification",
        content: `### 1. Epistemological Stance
Contemporary neural generation lacks deterministic formal bounds. By constructing an explicit multi-agent audit ledger, we enforce verification gates prior to synthesis.

### 2. Empirical Methodology
We evaluated 5,000 synthetic abstracts across 12 distinct scientific disciplines. Double-blind human verification confirmed a 99.4% factual alignment rate under Bayesian prior conditioning.`,
      };

      const chunks = chunkAcademicDocument(doc);
      expect(chunks.length).toBe(2);
      expect(chunks[0].breadcrumb).toBe("[Triangulated Multi-Agent Verification > 1. Epistemological Stance]");
      expect(chunks[1].breadcrumb).toBe("[Triangulated Multi-Agent Verification > 2. Empirical Methodology]");
    });
  });

  describe("2. Hybrid BM25 + Cosine Term-Vector Reranker & Stance Diversity", () => {
    it("correctly identifies citation stances (Contrasting, Methodological, Supporting)", () => {
      expect(
        detectChunkStance(
          "However, our empirical findings directly contradict the prevailing consensus, refuting the assumption of linear convergence."
        )
      ).toBe("Contrasting");

      expect(
        detectChunkStance(
          "We executed a randomized controlled trial with sample size N = 450, measuring statistical significance at p < 0.001."
        )
      ).toBe("Methodological");

      expect(
        detectChunkStance(
          "Our outcomes corroborate earlier findings and align with benchmark performance reported by Smith et al."
        )
      ).toBe("Supporting");
    });

    it("ensures stance diversity by guaranteeing at least 1 Contrasting and 1 Methodological chunk in top-K", () => {
      // 10 candidate chunks: mostly generic, 1 strongly contrasting, 1 strongly methodological
      const candidateDocs: AcademicDocumentInput[] = [
        {
          id: "sup-1",
          title: "Supporting Study 1",
          content: "General overview of neural network training in language models.",
        },
        {
          id: "sup-2",
          title: "Supporting Study 2",
          content: "Transformer architectures achieve high efficiency in language modeling benchmarks.",
        },
        {
          id: "sup-3",
          title: "Supporting Study 3",
          content: "Further exploration of attention weights and transformer scaling laws.",
        },
        {
          id: "contra-1",
          title: "Critical Counter-Evidence",
          content: "However, our empirical trials directly contradict previous scaling assumptions, demonstrating severe degradation in factual recall and refuting linear efficiency claims.",
        },
        {
          id: "method-1",
          title: "Rigorous Experimental Protocol",
          content: "We conducted a double-blind randomized benchmark across 1,000 trials with p < 0.001 and Cohen's d = 1.42, establishing construct validity.",
        },
      ];

      const allChunks = candidateDocs.flatMap((d) => chunkAcademicDocument(d));
      const ranked = retrieveTopKChunks(
        allChunks,
        "What are the scaling boundaries and empirical verification benchmarks of transformer architectures?",
        4,
        "Methodological Rigor and Counter-Arguments"
      );

      expect(ranked.length).toBeLessThanOrEqual(4);

      const stances = ranked.map((r) => r.stance);
      expect(stances).toContain("Contrasting");
      expect(stances).toContain("Methodological");
    });
  });

  describe("3. Context Budget Enforcer & Rolling Prior-Chapter Summary", () => {
    it("synthesizes a concise ~150-word Rolling Prior-Chapter Summary for multi-chapter manuscripts", () => {
      const priorChapters: PriorChapter[] = [
        {
          chapterNumber: 1,
          title: "Introduction and Epistemic Context",
          summary: "Established the critical failure of unchecked synthetic generation in academic publishing. Formulated the primary research question regarding deterministic verification rails.",
          keyFindings: [
            "LLMs exhibit 84% citation fabrication without cryptographic anchoring",
            "Epistemic uncertainty requires multi-agent consensus",
          ],
        },
        {
          chapterNumber: 2,
          title: "Theoretical Framework",
          summary: "Formalized the non-Markovian claim ledger and defined the epistemological verification boundaries.",
          keyFindings: [
            "Deterministic hash gates eliminate citation drift",
            "Triangulated peer review reduces hallucination variance",
          ],
        },
      ];

      const rollingSummary = generateRollingPriorChapterSummary(priorChapters);
      expect(rollingSummary).toContain("Chapter 1: Introduction and Epistemic Context");
      expect(rollingSummary).toContain("Chapter 2: Theoretical Framework");

      const wordCount = rollingSummary.split(/\s+/).filter(Boolean).length;
      expect(wordCount).toBeLessThanOrEqual(250);
      expect(wordCount).toBeGreaterThanOrEqual(40);
    });

    it("enforces strict token budget adapted to compact tier (<= 1500 tokens)", () => {
      // Create 20 mock academic documents
      const docs: AcademicDocumentInput[] = Array.from({ length: 20 }, (_, i) => ({
        id: `paper-${i + 1}`,
        title: `Empirical Investigation in Computational Scholarly Systems ${i + 1}`,
        author: `Author ${i + 1} et al.`,
        year: 2020 + (i % 5),
        content: `## Section A
This paper analyzes parameter optimization and factual attribution in autonomous scholarly networks. We conducted extensive benchmarks across multiple benchmark suites.
## Section B
Empirical evaluation reveals that unanchored networks fail under adversarial prompt injection. However, our proposed framework demonstrates robust resistance.
## Section C
Methodological protocols were strictly maintained throughout all experimental cycles. Statistical significance was verified with p < 0.001.`,
      }));

      const bounded = buildBoundedRagContext(docs, {
        researchQuestion: "How do deterministic verification gates prevent hallucination in multi-agent research co-authoring?",
        sectionQuery: "Methodological triangulation and empirical findings",
        maxTokenBudget: 1500,
      });

      expect(bounded.totalTokens).toBeLessThanOrEqual(1500);
      expect(bounded.chunks.length).toBeGreaterThan(0);
      expect(bounded.formattedContext).toContain("=== RETRIEVED ACADEMIC EVIDENCE CHUNKS ===");

      // Ensure every included chunk has valid attribution
      for (const chunk of bounded.chunks) {
        expect(chunk.attributionTag).toMatch(/\[CITE:paper-\d+\]/);
      }
    });

    it("scales context budget cleanly for standard/frontier tier (up to 6000 tokens)", () => {
      const docs: AcademicDocumentInput[] = Array.from({ length: 20 }, (_, i) => ({
        id: `doc-${i + 1}`,
        title: `Comprehensive Systematic Review ${i + 1}`,
        content: `Comprehensive analysis of multi-agent scholarly frameworks. We systematically analyzed literature from 2015 to 2025, evaluating 1,200 peer-reviewed articles. Our findings confirm that structured attribution improves review consensus by 34%.`,
      }));

      const bounded = buildBoundedRagContext(docs, {
        researchQuestion: "Systematic review of automated peer review architectures",
        sectionQuery: "Literature Synthesis and Consensus",
        maxTokenBudget: 6000,
      });

      expect(bounded.totalTokens).toBeLessThanOrEqual(6000);
      expect(bounded.chunks.length).toBeGreaterThanOrEqual(docs.length / 2);
    });
  });

  describe("4. End-to-End SSE Streaming in scholarBrain.stream()", () => {
    it("streams phase, delta, and complete SSE events with Unicode NFC & citation scrubbing", async () => {
      const sseEvents: Array<{ event: string; data: string }> = [];

      // Mock ResponseLike capturing res.write and res.end
      const mockRes = {
        headers: {} as Record<string, string>,
        setHeader(name: string, value: string) {
          this.headers[name] = value;
          return this;
        },
        write(chunk: string) {
          const match = chunk.match(/event: ([a-z]+)\ndata: ([\s\S]+?)\n\n/);
          if (match) {
            sseEvents.push({ event: match[1], data: match[2] });
          }
          return true;
        },
        end() {
          return this;
        },
        flushHeaders() {},
        writableEnded: false,
      };

      const result = await scholarBrain.stream(
        {} as never,
        {
          res: mockRes,
          systemPrompt: "You are an elite academic co-author.",
          userPrompt: "Draft an empirical finding section.",
          taskType: "drafting",
          stripCliches: true,
          vaultSources: [
            {
              id: "vaswani-2017",
              title: "Attention Is All You Need",
              author: "Vaswani et al.",
              year: 2017,
            },
          ],
        }
      );

      // Verify SSE Headers
      expect(mockRes.headers["Content-Type"]).toBe("text/event-stream; charset=utf-8");
      expect(mockRes.headers["Cache-Control"]).toBe("no-cache, no-transform");

      // Verify streamed events were emitted
      const eventTypes = sseEvents.map((e) => e.event);
      expect(eventTypes).toContain("phase");
      expect(eventTypes).toContain("delta");
      expect(eventTypes).toContain("complete");

      // Verify complete payload
      const completeEvent = sseEvents.find((e) => e.event === "complete");
      expect(completeEvent).toBeDefined();

      const completeData = JSON.parse(completeEvent!.data);
      expect(completeData.success).toBe(true);
      expect(completeData.cleanText).toBeDefined();
      expect(completeData.cleanText.length).toBeGreaterThan(0);

      // Result object check
      expect(result.cleanText).toBe(completeData.cleanText);
      expect(result.totalTokens).toBeGreaterThan(0);
    });

    it("applies incremental Unicode NFC normalization, Oxford spelling, and cliché stripping on stream completion", async () => {
      let completedText = "";

      const result = await scholarBrain.stream(
        {} as never,
        {
          systemPrompt: "Elite Scholar Assistant",
          userPrompt: "Generate sample text",
          stripCliches: true,
          onComplete: (text) => {
            completedText = text;
          },
        }
      );

      // Verify that the completed text is normalized Unicode NFC
      expect(result.cleanText.normalize("NFC")).toBe(result.cleanText);

      // Verify clichés are suppressed
      expect(result.cleanText.toLowerCase()).not.toContain("delve into the tapestry");
      expect(result.cleanText.toLowerCase()).not.toContain("testament to the");

      // Verify matching callback
      expect(completedText).toBe(result.cleanText);
    });
  });

  describe("5. 20-Paper Large Corpus Stress Test", () => {
    it("chunks 20 full papers and retrieves top-K relevant chunks strictly within budget without mid-sentence truncation", () => {
      const disciplines = [
        "Computational Linguistics", "Immunology", "Quantum Computing", "Cognitive Neuroscience",
        "Astrophysics", "Macroeconomics", "Bioinformatics", "Microbiology",
        "Organic Chemistry", "Cryptography", "Robotics", "Ecology",
        "Geology", "Evolutionary Biology", "Sociology", "Particle Physics",
        "Pharmacology", "Atmospheric Sciences", "Behavioral Economics", "Information Retrieval"
      ];

      const corpus: AcademicDocumentInput[] = disciplines.map((disc, idx) => ({
        id: `paper-${idx + 1}`,
        title: `Advances in ${disc}: Foundations and Empirical Verification`,
        author: `Lead Researcher ${idx + 1} et al.`,
        year: 2018 + (idx % 7),
        content: `## 1. Abstract
We present a rigorous investigation into ${disc}. Theoretical foundations predict non-linear scaling under divergent empirical constraints. We benchmarked our approach across extensive public repositories.

## 2. Methodological Framework
Our experimental protocol used a randomized controlled trial design across ${500 + idx * 50} subjects. Measurements were recorded at high temporal resolution with statistical significance established at p < 0.001.

## 3. Critical Findings and Dialectic
${
  idx % 3 === 0
    ? "However, our empirical outcomes directly contradict previous benchmarks, refuting the assumption of linear convergence and demonstrating significant variance."
    : "Our results demonstrate strong corroboration with established literature, validating the efficacy of the framework."
}

## 4. Discussion and Reproducibility
All artifacts, code repositories, and raw experimental telemetry are openly available under an MIT license. Further research should explore longitudinal stability across extended operational horizons.`,
      }));

      expect(corpus.length).toBe(20);

      // 1. Build bounded RAG context with compact budget (1500 tokens)
      const compactResult = buildBoundedRagContext(corpus, {
        researchQuestion: "How do empirical verification protocols resolve contradictory findings across multidisciplinary benchmarks?",
        sectionQuery: "Methodological rigor and critical counter-evidence",
        maxTokenBudget: 1500,
        modelTier: "compact",
      });

      expect(compactResult.totalTokens).toBeLessThanOrEqual(1500);
      expect(compactResult.chunks.length).toBeGreaterThan(0);

      // Stance diversity must be preserved even under strict 1500 token budget
      expect(compactResult.includedStances.Contrasting).toBeGreaterThanOrEqual(1);
      expect(compactResult.includedStances.Methodological).toBeGreaterThanOrEqual(1);

      // Verify every chunk has proper attribution and breadcrumbs
      for (const chunk of compactResult.chunks) {
        expect(chunk.citeTag).toMatch(/\[CITE:paper-\d+\]/);
        expect(chunk.breadcrumb).toMatch(/\[Advances in .+ > .+\]/);

        // Never truncates mid-sentence
        const trimmed = chunk.text.trim();
        const lastChar = trimmed[trimmed.length - 1];
        expect([".", "!", "?", "]", ")"]).toContain(lastChar);
      }

      // 2. Build bounded RAG context with standard budget (6000 tokens)
      const standardResult = buildBoundedRagContext(corpus, {
        researchQuestion: "Cross-disciplinary survey of empirical validation",
        sectionQuery: "Methodology and Results",
        maxTokenBudget: 6000,
        modelTier: "standard",
      });

      expect(standardResult.totalTokens).toBeLessThanOrEqual(6000);
      expect(standardResult.chunks.length).toBeGreaterThan(compactResult.chunks.length);
    });
  });
});
