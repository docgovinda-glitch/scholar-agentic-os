import { describe, it, expect, beforeEach, vi } from "vitest";
import { PipelineStageRegistry } from "../stageRegistry";
import type { DocumentIntelligenceStage, PipelineStageId } from "../types";

function createMockStage(id: PipelineStageId, overrides?: any): DocumentIntelligenceStage {
  return {
    stageId: id,
    execute: overrides?.execute ?? (async () => ({} as any)),
  };
}

describe("PipelineStageRegistry", () => {
  let registry: PipelineStageRegistry;

  beforeEach(() => {
    registry = PipelineStageRegistry.getInstance();
    registry.clear();
  });

  describe("Registration", () => {
    it("should register a stage successfully", () => {
      const stage = createMockStage("validate");
      const result = registry.register(stage);

      expect(result.success).toBe(true);
      expect(registry.get("validate")).toBeDefined();
    });

    it("should reject duplicate registration without force", () => {
      const stage = createMockStage("validate");
      registry.register(stage);
      const result = registry.register(stage);

      expect((result as any).success).toBe(false);
      if (!(result as any).success) {
        expect((result as any).reason).toContain("already registered");
      }
    });

    it("should allow force override", () => {
      registry.register(createMockStage("parse"));
      const result = registry.register(createMockStage("parse"), { force: true });

      expect(result.success).toBe(true);
    });
  });

  describe("Unregistration", () => {
    it("should unregister an existing stage", () => {
      registry.register(createMockStage("validate"));

      expect(registry.unregister("validate")).toBe(true);
      expect(registry.get("validate")).toBeUndefined();
    });

    it("should return false when unregistering non-existent stage", () => {
      // "extract_references" is a valid stage id but has not been registered,
      // so unregister must report failure without a type error.
      expect(registry.unregister("extract_references")).toBe(false);
    });
  });

  describe("Discovery", () => {
    it("should get a stage by ID", () => {
      registry.register(createMockStage("validate"));
      expect(registry.get("validate")).toBeDefined();
    });

    it("should list all registered stages", () => {
      registry.register(createMockStage("validate"));
      registry.register(createMockStage("parse"));

      const stages = registry.list();
      expect(stages.length).toBe(2);
    });

    it("should check if stage exists", () => {
      registry.register(createMockStage("validate"));

      expect(registry.has("validate")).toBe(true);
      expect(registry.has("parse")).toBe(false);
    });

    it("should return stages in order", () => {
      registry.register(createMockStage("parse"), { order: 200 });
      registry.register(createMockStage("validate"), { order: 100 });
      registry.register(createMockStage("generate_model"), { order: 300 });

      const ordered = registry.getOrdered();
      expect(ordered[0].stageId).toBe("validate");
      expect(ordered[1].stageId).toBe("parse");
      expect(ordered[2].stageId).toBe("generate_model");
    });
  });

  describe("Event Emission", () => {
    it("should emit stage.registered event", () => {
      const handler = vi.fn();
      registry.on("stage.registered", handler);

      registry.register(createMockStage("validate"));

      expect(handler).toHaveBeenCalledWith({ stageId: "validate", order: 0 });
    });

    it("should return unsubscribe function", () => {
      const handler = vi.fn();
      const unsubscribe = registry.on("stage.registered", handler);

      registry.register(createMockStage("validate"));
      expect(handler).toHaveBeenCalledTimes(1);

      unsubscribe();
      registry.register(createMockStage("parse"));
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe("Clear", () => {
    it("should clear all registered stages", () => {
      registry.register(createMockStage("validate"));
      expect(registry.list().length).toBe(1);

      registry.clear();
      expect(registry.list().length).toBe(0);
    });
  });
});