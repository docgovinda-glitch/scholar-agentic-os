import { describe, it, expect } from "vitest";
import {
  tokenizeText,
  buildTermFrequencyVector,
  computeCosineSimilarity,
  searchVaultSemantically,
  rankVaultItemsForProject,
  extractMatchedConcepts,
  createRelevantSnippet,
} from "../semanticSearchService";
import type { VaultItem } from "../../vaultContents";

const sampleVault: VaultItem[] = [
  {
    id: "item-1",
    title: "Deep Reinforcement Learning for Robotic Manipulation",
    content: "We present a novel policy gradient algorithm for robotic arms grasping complex objects in unstructured environments.",
    tags: ["robotics", "reinforcement learning", "deep learning"],
    collection: "AI & Robotics",
    authors: ["John Silver", "Alan Turing"],
    year: "2023",
    citation: "Silver & Turing, 2023",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "item-2",
    title: "Microplastic Pollution in Marine Ecosystems",
    content: "A longitudinal study analyzing microplastic density in coastal sediments across the North Pacific Gyre and its impact on invertebrate biology.",
    tags: ["ecology", "marine biology", "pollution"],
    collection: "Environmental Science",
    authors: ["Jane Goodall", "Rachel Carson"],
    year: "2022",
    citation: "Goodall & Carson, 2022",
    createdAt: "2026-01-02T00:00:00.000Z",
  },
  {
    id: "item-3",
    title: "Transformer-based Natural Language Processing in Clinical Records",
    content: "Evaluating BERT and GPT architectures for extracting electronic health record clinical concepts and medication entities.",
    tags: ["nlp", "clinical", "transformers", "healthcare"],
    collection: "Bioinformatics",
    authors: ["Ada Lovelace"],
    year: "2024",
    citation: "Lovelace, 2024",
    createdAt: "2026-01-03T00:00:00.000Z",
  },
];

describe("semanticSearchService", () => {
  describe("tokenizeText", () => {
    it("tokenizes words, strips punctuation, and builds bigram phrases", () => {
      const tokens = tokenizeText("Deep learning in clinical NLP!");
      expect(tokens).toContain("deep");
      expect(tokens).toContain("learning");
      expect(tokens).toContain("clinical");
      expect(tokens).toContain("nlp");
      expect(tokens).toContain("deep learning");
      expect(tokens).toContain("clinical nlp");
    });

    it("filters out stop words", () => {
      const tokens = tokenizeText("This is an article about the robot");
      expect(tokens).not.toContain("this");
      expect(tokens).not.toContain("is");
      expect(tokens).not.toContain("an");
      expect(tokens).not.toContain("about");
      expect(tokens).not.toContain("the");
      expect(tokens).toContain("article");
      expect(tokens).toContain("robot");
    });
  });

  describe("computeCosineSimilarity", () => {
    it("returns 1.0 for identical vectors", () => {
      const vecA = buildTermFrequencyVector(["neural", "network", "transformer"]);
      const vecB = buildTermFrequencyVector(["neural", "network", "transformer"]);
      const sim = computeCosineSimilarity(vecA, vecB);
      expect(sim).toBeCloseTo(1.0);
    });

    it("returns 0.0 for completely disjoint vectors", () => {
      const vecA = buildTermFrequencyVector(["robotics", "manipulation"]);
      const vecB = buildTermFrequencyVector(["microplastics", "marine"]);
      const sim = computeCosineSimilarity(vecA, vecB);
      expect(sim).toBe(0.0);
    });

    it("computes proportional similarity for overlapping vectors", () => {
      const vecA = buildTermFrequencyVector(["deep", "learning", "robotics"]);
      const vecB = buildTermFrequencyVector(["deep", "learning", "nlp"]);
      const sim = computeCosineSimilarity(vecA, vecB);
      expect(sim).toBeGreaterThan(0.4);
      expect(sim).toBeLessThan(0.9);
    });
  });

  describe("searchVaultSemantically", () => {
    it("ranks robotic manipulation highest for robotics / RL query", () => {
      const results = searchVaultSemantically(sampleVault, "reinforcement learning robotics policy");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].item.id).toBe("item-1");
      expect(results[0].score).toBeGreaterThan(50);
      expect(results[0].matchedConcepts).toContain("robotics");
    });

    it("ranks clinical NLP paper highest for BERT/healthcare query", () => {
      const results = searchVaultSemantically(sampleVault, "health records transformers clinical");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].item.id).toBe("item-3");
      expect(results[0].score).toBeGreaterThan(50);
      expect(results[0].matchedConcepts).toContain("clinical");
    });

    it("returns empty array for non-matching queries or blank input", () => {
      expect(searchVaultSemantically(sampleVault, "")).toEqual([]);
      expect(searchVaultSemantically(sampleVault, "astrophysics black holes quasar", { threshold: 40 })).toEqual([]);
    });
  });

  describe("rankVaultItemsForProject", () => {
    it("ranks papers relevant to a research project topic and questions", () => {
      const context = {
        title: "Ocean Pollution Assessment",
        topic: "Marine plastic debris and ecological impact",
        researchQuestion: "How do microplastics degrade coastal sediment biodiversity?",
        keywords: ["marine biology", "invertebrates"],
      };

      const ranked = rankVaultItemsForProject(sampleVault, context);
      expect(ranked.length).toBeGreaterThan(0);
      expect(ranked[0].item.id).toBe("item-2");
      expect(ranked[0].score).toBeGreaterThan(60);
    });
  });

  describe("extractMatchedConcepts and createRelevantSnippet", () => {
    it("extracts matched phrases and builds surrounding snippet", () => {
      const queryTokens = ["clinical", "concepts"];
      const docTokens = ["nlp", "clinical", "concepts", "ehr"];
      const matched = extractMatchedConcepts(queryTokens, docTokens);
      expect(matched).toContain("clinical");
      expect(matched).toContain("concepts");

      const snippet = createRelevantSnippet(
        "Evaluating BERT and GPT architectures for extracting electronic health record clinical concepts and medication entities.",
        ["clinical concepts"]
      );
      expect(snippet).toContain("clinical concepts");
    });
  });
});
