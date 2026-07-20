import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { SkillExecutor, getExecutor, runSkill, type ExecuteOptions } from "../executor";
import { SkillRegistry } from "../registry";
import type { Skill, SkillContext, SkillResult } from "../types";

// ============================================================================
// Mock Skill Factory
// ============================================================================

function createMockSkill<TInput = unknown, TOutput = unknown>(
  id: string,
  overrides: any = {}
): Skill<TInput, TOutput> {
  return {
    metadata: {
      id,
      name: `Test Skill ${id}`,
      description: "A mock skill for testing",
      version: "1.0.0",
      category: "Document",
      author: "test",
      offlineCapable: true,
      aiEnhanced: false,
    },
    validate: overrides.validate,
    beforeExecute: overrides.beforeExecute,
    afterExecute: overrides.afterExecute,
    async execute(input, context) {
      if (overrides.execute) {
        return overrides.execute(input, context);
      }
      return { ok: true, data: "default result" as TOutput };
    },
  } as Skill<TInput, TOutput>;
}

describe("SkillExecutor", () => {
  let executor: SkillExecutor;

  beforeEach(() => {
    executor = new SkillExecutor();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================================
  // Successful Execution
  // ============================================================================

  describe("Successful Execution", () => {
    it("should execute a skill successfully and return result", async () => {
      const skill = createMockSkill("test.success", {
        execute: async () => ({ ok: true, data: "success data" }),
      });

      const result = await executor.execute(skill, "input");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toBe("success data");
      }
    });

    it("should record metrics on successful execution", async () => {
      const skill = createMockSkill("test.metrics", {
        execute: async () => {
          await new Promise((r) => setTimeout(r, 5));
          return { ok: true, data: "data" };
        },
      });

      await executor.execute(skill, "input");

      const metrics = executor.getMetrics();
      expect(metrics.length).toBe(1);
      expect(metrics[0].skillId).toBe("test.metrics");
      expect(metrics[0].success).toBe(true);
      expect(metrics[0].durationMs).toBeGreaterThanOrEqual(0);
    });

    it("should call afterExecute hook on success", async () => {
      const afterHook = vi.fn();
      const skill = createMockSkill("test.afterhook", {
        execute: async () => ({ ok: true, data: "data" }),
        afterExecute: afterHook,
      });

      await executor.execute(skill, "input");

      expect(afterHook).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Validation Failures
  // ============================================================================

  describe("Validation Failures", () => {
    it("should fail validation and return error result", async () => {
      const skill = createMockSkill("test.validation", {
        validate: () => ({ valid: false, errors: ["Invalid input", "Missing field"] }),
        execute: async () => ({ ok: true, data: "should not run" }),
      });

      const result = await executor.execute(skill, "input");

      expect(result.ok).toBe(false);
      if (result.ok === false) {
        expect(result.error.type).toBe("VALIDATION_ERROR");
        expect(result.error.message).toContain("Invalid input");
        expect(result.error.message).toContain("Missing field");
      }
    });

    it("should record metrics on validation failure", async () => {
      const skill = createMockSkill("test.validation-metrics", {
        validate: () => ({ valid: false, errors: ["Failed"] }),
      });

      await executor.execute(skill, "input");

      const metrics = executor.getMetrics();
      expect(metrics[0].success).toBe(false);
      expect(metrics[0].error).toContain("Failed");
    });

    it("should not call afterExecute on validation failure", async () => {
      const afterHook = vi.fn();
      const skill = createMockSkill("test.no-after", {
        validate: () => ({ valid: false, errors: ["Invalid"] }),
        afterExecute: afterHook,
        execute: async () => ({ ok: true, data: "data" }),
      });

      await executor.execute(skill, "input");

      expect(afterHook).not.toHaveBeenCalled();
    });

    it("should handle async validation", async () => {
      const skill = createMockSkill("test.async-validation", {
        validate: async () => ({ valid: false, errors: ["Async validation failed"] }),
      });

      const result = await executor.execute(skill, "input");

      expect(result.ok).toBe(false);
      if (result.ok === false) {
        expect(result.error.type).toBe("VALIDATION_ERROR");
      }
    });

    it("should handle validation exceptions gracefully", async () => {
      const skill = createMockSkill("test.validation-exception", {
        validate: () => {
          throw new Error("Unexpected validation error");
        },
      });

      const result = await executor.execute(skill, "input");

      expect(result.ok).toBe(false);
      if (result.ok === false) {
        expect(result.error.type).toBe("VALIDATION_ERROR");
      }
    });
  });

  // ============================================================================
  // Execution Failures
  // ============================================================================

  describe("Execution Failures", () => {
    it("should return error result when skill.execute returns failure", async () => {
      const skill = createMockSkill("test.execute-failure", {
        execute: async () => ({
          ok: false,
          error: { type: "EXECUTION_ERROR", message: "Skill failed" },
        }),
      });

      const result = await executor.execute(skill, "input");

      expect(result.ok).toBe(false);
      if (result.ok === false) {
        expect(result.error.type).toBe("EXECUTION_ERROR");
        expect(result.error.message).toBe("Skill failed");
      }
    });

    it("should record metrics on execution failure", async () => {
      const skill = createMockSkill("test.failure-metrics", {
        execute: async () => ({
          ok: false,
          error: { type: "EXECUTION_ERROR", message: "Failed" },
        }),
      });

      await executor.execute(skill, "input");

      const metrics = executor.getMetrics();
      expect(metrics[0].success).toBe(false);
      expect(metrics[0].error).toBe("Failed");
    });

    it("should handle missing skill", async () => {
      const result = await executor.execute(undefined, "input");

      expect(result.ok).toBe(false);
      if (result.ok === false) {
        expect(result.error.type).toBe("EXECUTION_ERROR");
        expect(result.error.message).toBe("Skill not found or not enabled");
      }
    });
  });

  // ============================================================================
  // Unexpected Exceptions
  // ============================================================================

  describe("Unexpected Exceptions", () => {
    it("should catch unexpected exceptions in execute", async () => {
      const skill = createMockSkill("test.unexpected", {
        execute: async () => {
          throw new Error("Unexpected error");
        },
      });

      const result = await executor.execute(skill, "input");

      expect(result.ok).toBe(false);
      if (result.ok === false) {
        expect(result.error.type).toBe("EXECUTION_ERROR");
        expect(result.error.message).toBe("Unexpected error");
        expect(result.error.cause).toBeInstanceOf(Error);
      }
    });

    it("should catch non-Error exceptions", async () => {
      const skill = createMockSkill("test.non-error", {
        execute: async () => {
          throw "string error";
        },
      });

      const result = await executor.execute(skill, "input");

      expect(result.ok).toBe(false);
      if (result.ok === false) {
        expect(result.error.message).toBe("string error");
      }
    });
  });

  // ============================================================================
  // Timeout Handling
  // ============================================================================

  describe("Timeout Handling", () => {
    it("should timeout long-running executions", async () => {
      const skill = createMockSkill("test.timeout", {
        execute: async () => {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          return { ok: true, data: "should not complete" };
        },
      });

      const result = await executor.execute(skill, "input", { timeoutMs: 50 });

      expect(result.ok).toBe(false);
      if (result.ok === false) {
        expect(result.error.message).toContain("timed out");
      }
    });

    it("should not timeout when no timeout specified", async () => {
      const skill = createMockSkill("test.no-timeout", {
        execute: async () => {
          await new Promise((resolve) => setTimeout(resolve, 20));
          return { ok: true, data: "completed" };
        },
      });

      const result = await executor.execute(skill, "input");

      expect(result.ok).toBe(true);
    });

    it("should record metrics on timeout failure", async () => {
      const skill = createMockSkill("test.timeout-metrics", {
        execute: async () => {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          return { ok: true, data: "data" };
        },
      });

      await executor.execute(skill, "input", { timeoutMs: 30 });

      const metrics = executor.getMetrics();
      expect(metrics[0].success).toBe(false);
      expect(metrics[0].error).toContain("timed out");
    });
  });

  // ============================================================================
  // Configuration Propagation
  // ============================================================================

  describe("Configuration Propagation", () => {
    it("should pass configuration to skill context", async () => {
      let receivedConfig: Record<string, unknown> | undefined;
      const skill = createMockSkill("test.config", {
        execute: async (_input, context) => {
          receivedConfig = context.config;
          return { ok: true, data: "data" };
        },
      });

      await executor.execute(skill, "input", {
        config: { timeout: 5000, retries: 3 },
      });

      expect(receivedConfig).toEqual({ timeout: 5000, retries: 3 });
    });
  });

  // ============================================================================
  // Logging Behavior
  // ============================================================================

  describe("Logging Behavior", () => {
    it("should provide scoped logger to skills", async () => {
      const skill = createMockSkill("test.logging", {
        execute: async (_input, context) => {
          // Logger should have all methods
          expect(typeof context.logger.debug).toBe("function");
          expect(typeof context.logger.info).toBe("function");
          expect(typeof context.logger.warn).toBe("function");
          expect(typeof context.logger.error).toBe("function");
          return { ok: true, data: "data" };
        },
      });

      await executor.execute(skill, "input");
    });
  });

  // ============================================================================
  // Metrics Collection
  // ============================================================================

  describe("Metrics Collection", () => {
    it("should collect metrics for each execution", async () => {
      const skill = createMockSkill("test.metrics-collection");

      await executor.execute(skill, "input1");
      await executor.execute(skill, "input2");
      await executor.execute(skill, "input3");

      const metrics = executor.getMetrics();
      expect(metrics.length).toBe(3);
    });

    it("should clear metrics history", async () => {
      const skill = createMockSkill("test.clear-metrics");

      await executor.execute(skill, "input");
      expect(executor.getMetrics().length).toBe(1);

      executor.clearMetrics();
      expect(executor.getMetrics().length).toBe(0);
    });

    it("should include timestamp in metrics", async () => {
      const skill = createMockSkill("test.timestamp");

      await executor.execute(skill, "input");

      const metrics = executor.getMetrics();
      expect(metrics[0].timestamp).toBeDefined();
      expect(new Date(metrics[0].timestamp)).toBeInstanceOf(Date);
    });
  });

  // ============================================================================
  // Event Emission
  // ============================================================================

  describe("Event Emission", () => {
    it("should emit events from skills", async () => {
      const handler = vi.fn();
      executor.on("test.event", handler);

      const skill = createMockSkill("test.events", {
        execute: async (_input, context) => {
          context.emit("test.event", { message: "hello" });
          return { ok: true, data: "data" };
        },
      });

      await executor.execute(skill, "input");

      expect(handler).toHaveBeenCalledWith({ message: "hello" });
    });

    it("should return unsubscribe function", async () => {
      const handler = vi.fn();
      const unsubscribe = executor.on("test.event", handler);

      const skill = createMockSkill("test.unsubscribe-events", {
        execute: async (_input, context) => {
          context.emit("test.event", { data: "first" });
          return { ok: true, data: "data" };
        },
      });

      await executor.execute(skill, "input");
      expect(handler).toHaveBeenCalledTimes(1);

      unsubscribe();

      await executor.execute(skill, "input");
      expect(handler).toHaveBeenCalledTimes(1); // Still 1 after unsubscribe
    });
  });

  // ============================================================================
  // Dependency Injection
  // ============================================================================

  describe("Dependency Injection", () => {
    it("should use custom permission checker", async () => {
      let permissionCheck = false;
      const skill = createMockSkill("test.permissions", {
        execute: async (_input, context) => {
          permissionCheck = context.hasPermission("write");
          return { ok: true, data: "data" };
        },
      });

      await executor.execute(skill, "input", {
        permissionChecker: (p) => p === "write",
      });

      expect(permissionCheck).toBe(true);
    });

    it("should support createContext method", () => {
      const context = executor.createContext("test.skill", {
        config: { key: "value" },
        permissionChecker: () => true,
      });

      expect(context.config).toEqual({ key: "value" });
      expect(typeof context.hasPermission).toBe("function");
      expect(typeof context.emit).toBe("function");
    });
  });

  // ============================================================================
  // Multiple Concurrent Executions
  // ============================================================================

  describe("Multiple Concurrent Executions", () => {
    it("should handle concurrent executions", async () => {
      const skill = createMockSkill("test.concurrent", {
        execute: async () => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          return { ok: true, data: "result" };
        },
      });

      const promises = [
        executor.execute(skill, "input1"),
        executor.execute(skill, "input2"),
        executor.execute(skill, "input3"),
      ];

      const results = await Promise.all(promises);

      results.forEach((result) => {
        expect(result.ok).toBe(true);
      });
      expect(executor.getMetrics().length).toBe(3);
    });
  });

  // ============================================================================
  // Convenience Functions
  // ============================================================================

  describe("Convenience Functions", () => {
    it("should return singleton executor via getExecutor", () => {
      const ex1 = getExecutor();
      const ex2 = getExecutor();

      expect(ex1).toBe(ex2);
    });

    it("should execute skill by ID via runSkill", async () => {
      const registry = SkillRegistry.getInstance();
      registry.clear();
      registry.register(createMockSkill("run.skill") as any);

      const result = await runSkill("run.skill", "input");

      expect(result.ok).toBe(true);
    });

    it("should return error for missing skill in runSkill", async () => {
      const result = await runSkill("nonexistent.skill", "input");

      expect(result.ok).toBe(false);
      if (result.ok === false) {
        expect(result.error.message).toContain("not found");
      }
    });
  });
});