import { describe, it, expect } from "vitest";
import {
  createHumanizerDocument,
  renderHumanizerDocument,
  updateBlockInDocument,
  addLockedTerm,
  serializeHumanizerDocument,
  deserializeHumanizerDocument,
  segmentSentences,
} from "../document/humanizerDocument";

describe("Phase 1: Canonical HumanizerDocument Representation", () => {
  const COW_SAMPLE = `The cow is one of the most useful domestic animals in the world (Wilson et al., 2022). It has been closely associated with human civilization for thousands of years. People keep cows for milk, farming, and other useful products. In many countries, especially in South Asia, cows are an important part of rural life.

A cow is a herbivorous animal that mainly eats grass, hay, and other plant-based food. It has four legs, two horns, two ears, and a long tail. Empirical studies show that milk production efficiency improves significantly with targeted forage nutrition with $p < 0.001$ and $R^2 = 0.88$ [4, 7]. Milk is one of the most important products obtained from cows. It is rich in nutrients such as protein, calcium, and vitamins and is used to make products such as curd, butter, cheese, ghee, and yogurt. Cow dung is also useful because it can be used as organic manure for agriculture and, in some places, as a source of biogas.

Cows have a special cultural and religious importance in Nepal and India. In Hindu traditions, the cow is regarded as a sacred and respected animal. In Nepal, the cow is also the national animal. The festival of Tihar includes a special day called Gai Tihar, when cows are worshipped and honored.

Cows contribute greatly to the livelihoods of farmers. However, they should not be treated merely as sources of economic benefit. They need adequate food, clean water, shelter, medical care, and humane treatment. Ultimately, the cow is a valuable and important animal. It provides food and useful agricultural resources and has deep cultural significance. We should recognize its contribution and treat cows with kindness and care.`;

  describe("Document Creation & Structural Hierarchy", () => {
    it("parses multi-paragraph text into structured blocks with stable IDs", () => {
      const doc = createHumanizerDocument(COW_SAMPLE, { title: "Cow Research Study" });

      expect(doc.metadata.title).toBe("Cow Research Study");
      expect(doc.metadata.sourceWordCount).toBeGreaterThan(200);
      expect(doc.blocks).toHaveLength(4);

      // Verify stable IDs
      expect(doc.blocks[0].id).toBe("p_001");
      expect(doc.blocks[1].id).toBe("p_002");
      expect(doc.blocks[2].id).toBe("p_003");
      expect(doc.blocks[3].id).toBe("p_004");

      // Verify sentence segmentation within blocks
      expect(doc.blocks[0].sentences.length).toBeGreaterThanOrEqual(3);
      expect(doc.blocks[0].sentences[0].id).toBe("s_001");
      expect(doc.blocks[0].sentences[0].text).toContain("Wilson et al., 2022");
    });

    it("correctly identifies headings, blockquotes, and lists", () => {
      const complexText = `# Section 1: Introduction

This is the main introduction paragraph.

> This is an important quote from a primary source.

- Key point A
- Key point B`;

      const doc = createHumanizerDocument(complexText);
      expect(doc.blocks).toHaveLength(4);

      expect(doc.blocks[0].type).toBe("heading");
      expect(doc.blocks[0].headingLevel).toBe(1);
      expect(doc.blocks[1].type).toBe("paragraph");
      expect(doc.blocks[2].type).toBe("blockquote");
      expect(doc.blocks[3].type).toBe("list_item");
    });
  });

  describe("Sentence Tokenization with Academic Abbreviation Protection", () => {
    it("does not split sentences on 'et al.', 'i.e.', 'e.g.', or decimal numbers", () => {
      const text = "Smith et al. conducted the trial with p < 0.05. The result was 3.14 mg/L (i.e., statistically significant). Next sentence.";
      const sentences = segmentSentences(text);

      expect(sentences).toHaveLength(3);
      expect(sentences[0]).toBe("Smith et al. conducted the trial with p < 0.05.");
      expect(sentences[1]).toBe("The result was 3.14 mg/L (i.e., statistically significant).");
      expect(sentences[2]).toBe("Next sentence.");
    });
  });

  describe("Deterministic Document Rendering & Round-Trip", () => {
    it("renders document preserving exact paragraph breaks without flattening", () => {
      const doc = createHumanizerDocument(COW_SAMPLE);
      const rendered = renderHumanizerDocument(doc, "source");

      // Verify that rendering reproduces the 4 paragraphs separated by \n\n
      const renderedParagraphs = rendered.split(/\n{2,}/);
      expect(renderedParagraphs).toHaveLength(4);
      expect(renderedParagraphs[0]).toContain("Wilson et al., 2022");
      expect(renderedParagraphs[1]).toContain("herbivorous animal");
      expect(renderedParagraphs[2]).toContain("Nepal and India");
      expect(renderedParagraphs[3]).toContain("livelihoods of farmers");
    });

    it("updates specific block text while preserving untouched blocks", () => {
      const doc = createHumanizerDocument(COW_SAMPLE);
      const updatedDoc = updateBlockInDocument(
        doc,
        "p_001",
        "Domesticated for millennia, cows remain foundational to human subsistence (Wilson et al., 2022)."
      );

      expect(updatedDoc.blocks[0].processedText).toContain("Domesticated for millennia");
      expect(updatedDoc.blocks[1].processedText).toBe(doc.blocks[1].sourceText); // Untouched

      const rendered = renderHumanizerDocument(updatedDoc, "processed");
      expect(rendered).toContain("Domesticated for millennia");
      expect(rendered).toContain("herbivorous animal");
    });
  });

  describe("Terminology Memory & Locked Terms", () => {
    it("registers and preserves user-locked terms", () => {
      const doc = createHumanizerDocument("The concept of Rajadharma and Vedic Trusteeship is analyzed.");
      const lockedDoc = addLockedTerm(doc, "Rajadharma");
      const lockedDoc2 = addLockedTerm(lockedDoc, "Vedic Trusteeship");

      expect(lockedDoc2.terminologyMemory.lockedTerms).toContain("Rajadharma");
      expect(lockedDoc2.terminologyMemory.lockedTerms).toContain("Vedic Trusteeship");
      expect((lockedDoc2.terminologyMemory.terms as any)["Rajadharma"].locked).toBe(true);
    });
  });

  describe("Serialization & Deserialization", () => {
    it("serializes and deserializes HumanizerDocument with full state preservation", () => {
      const doc = createHumanizerDocument(COW_SAMPLE, { title: "Test Doc" });
      const json = serializeHumanizerDocument(doc);
      const restored = deserializeHumanizerDocument(json);

      expect(restored.metadata.title).toBe("Test Doc");
      expect(restored.blocks).toHaveLength(4);
      expect(restored.versionInfo.pipelineVersion).toBe("2.0.0");
    });
  });
});
