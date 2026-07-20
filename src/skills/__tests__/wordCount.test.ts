import { describe, it, expect, vi, beforeEach } from "vitest";
import { createWordCountSkill, type WordCountInput } from "../examples/wordCountSkill";
import { SkillRegistry } from "../registry";

describe("Word Count Skill", () => {
  let registry: SkillRegistry;

  beforeEach(() => {
    registry = SkillRegistry.getInstance();
    registry.clear();
  });

  describe("Skill Definition", () => {
    it("should have correct metadata", () => {
      const skill = createWordCountSkill();
      
      expect(skill.metadata.id).toBe("utility.word-count");
      expect(skill.metadata.name).toBe("Word Count Skill");
      expect(skill.metadata.category).toBe("Utility");
      expect(skill.metadata.offlineCapable).toBe(true);
      expect(skill.metadata.aiEnhanced).toBe(false);
      expect(skill.metadata.tags).toContain("text-analysis");
    });

    it("should have validation hook defined", () => {
      const skill = createWordCountSkill();
      expect(typeof (skill as any).validate).toBe("function");
    });

    it("should have lifecycle hooks defined", () => {
      const skill = createWordCountSkill();
      expect(typeof (skill as any).beforeExecute).toBe("function");
      expect(typeof (skill as any).afterExecute).toBe("function");
    });

    it("should have execute hook defined", () => {
      const skill = createWordCountSkill();
      expect(typeof skill.execute).toBe("function");
    });
  });

  describe("Validation", () => {
    it("should accept valid string input", () => {
      const skill = createWordCountSkill();
      const input: WordCountInput = { text: "Hello world" };
      const context = {
        logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        config: {},
        emit: vi.fn(),
        hasPermission: () => true,
      } as any;

      const result = (skill as any).validate(input, context);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("should accept valid array input", () => {
      const skill = createWordCountSkill();
      const input: WordCountInput = { text: ["Hello", "world"] };
      const context = {
        logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        config: {},
        emit: vi.fn(),
        hasPermission: () => true,
      } as any;

      const result = (skill as any).validate(input, context);
      expect(result.valid).toBe(true);
    });

    it("should reject missing text input", () => {
      const skill = createWordCountSkill();
      const input = {} as WordCountInput;
      const context = {
        logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        config: {},
        emit: vi.fn(),
        hasPermission: () => true,
      } as any;

      const result = (skill as any).validate(input, context);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Text input is required");
    });

    it("should reject empty text input", () => {
      const skill = createWordCountSkill();
      const input: WordCountInput = { text: "" };
      const context = {
        logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        config: {},
        emit: vi.fn(),
        hasPermission: () => true,
      } as any;

      const result = (skill as any).validate(input, context);
      expect(result.valid).toBe(false);
      // Empty string is falsy, so it triggers the "required" check
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe("Execution", () => {
    it("should count words correctly", async () => {
      const skill = createWordCountSkill();
      const input: WordCountInput = { text: "one two three" };
      const context = {
        logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        config: {},
        emit: vi.fn(),
        hasPermission: () => true,
      } as any;

      const result = await skill.execute(input, context);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.totalCount).toBe(3);
        expect(result.data.uniqueCount).toBe(3);
      }
    });

    it("should handle repeated words", async () => {
      const skill = createWordCountSkill();
      const input: WordCountInput = { text: "hello world world world" };
      const context = {
        logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        config: {},
        emit: vi.fn(),
        hasPermission: () => true,
      } as any;

      const result = await skill.execute(input, context);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.totalCount).toBe(4);
        expect(result.data.uniqueCount).toBe(2);
        expect(result.data.frequency["world"]).toBe(3);
        expect(result.data.frequency["hello"]).toBe(1);
      }
    });

    it("should return top words by frequency", async () => {
      const skill = createWordCountSkill();
      const input: WordCountInput = { text: "a b b c c c b a d" };
      const context = {
        logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        config: {},
        emit: vi.fn(),
        hasPermission: () => true,
      } as any;

      const result = await skill.execute(input, context);
      expect(result.ok).toBe(true);
      if (result.ok) {
        // Both "b" and "c" appear 3 times each
        expect(result.data.topWords[0].count).toBe(3);
        // Verify one of them is in the top position
        const topWord = result.data.topWords[0].word;
        expect(["b", "c"]).toContain(topWord);
      }
    });

    it("should handle array input", async () => {
      const skill = createWordCountSkill();
      const input: WordCountInput = { text: ["one", "two three"] };
      const context = {
        logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        config: {},
        emit: vi.fn(),
        hasPermission: () => true,
      } as any;

      const result = await skill.execute(input, context);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.totalCount).toBe(3);
      }
    });

    it("should apply minWordLength filter", async () => {
      const skill = createWordCountSkill();
      const input: WordCountInput = { text: "a ab abc abcd" };
      const context = {
        logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        config: { minWordLength: 3 },
        emit: vi.fn(),
        hasPermission: () => true,
      } as any;

      const result = await skill.execute(input, context);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.totalCount).toBe(4);
        expect(result.data.uniqueCount).toBe(2);
        expect(result.data.frequency["a"]).toBeUndefined();
        expect(result.data.frequency["ab"]).toBeUndefined();
      }
    });

    it("should apply stop words filter", async () => {
      const skill = createWordCountSkill();
      const input: WordCountInput = { text: "the a an hello world" };
      const context = {
        logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        config: { excludeStopWords: true },
        emit: vi.fn(),
        hasPermission: () => true,
      } as any;

      const result = await skill.execute(input, context);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.uniqueCount).toBe(2);
        expect(result.data.frequency["the"]).toBeUndefined();
        expect(result.data.frequency["a"]).toBeUndefined();
        expect(result.data.frequency["an"]).toBeUndefined();
      }
    });

    it("should respect maxTopWords config", async () => {
      const skill = createWordCountSkill();
      const input: WordCountInput = { text: "a b c d e f g h i j k" };
      const context = {
        logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        config: { maxTopWords: 3 },
        emit: vi.fn(),
        hasPermission: () => true,
      } as any;

      const result = await skill.execute(input, context);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.topWords.length).toBe(3);
      }
    });

    it("should emit custom event on completion", async () => {
      const skill = createWordCountSkill();
      const input: WordCountInput = { text: "test" };
      const emitMock = vi.fn();
      const context = {
        logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        config: {},
        emit: emitMock,
        hasPermission: () => true,
      } as any;

      await skill.execute(input, context);
      expect(emitMock).toHaveBeenCalledWith("wordcount.completed", {
        skillId: "utility.word-count",
        totalCount: 1,
      });
    });

    it("should return diagnostics with execution", async () => {
      const skill = createWordCountSkill();
      const input: WordCountInput = { text: "hello world" };
      const context = {
        logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        config: {},
        emit: vi.fn(),
        hasPermission: () => true,
      } as any;

      const result = await skill.execute(input, context);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.diagnostics).toBeDefined();
        expect(result.diagnostics?.operationsCount).toBe(1);
        expect(result.diagnostics?.memoryUsed).toBe(11);
      }
    });
  });
});