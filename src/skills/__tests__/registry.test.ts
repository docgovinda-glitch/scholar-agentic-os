import { SkillRegistry } from "../registry";
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock skill factory for testing
function createMockSkill(id: string, overrides?: any): any {
  const metadata = {
    id,
    name: `Test Skill ${id}`,
    description: "A mock skill for testing",
    version: "1.0.0",
    category: "Document",
    author: "test",
    offlineCapable: true,
    aiEnhanced: false,
    ...overrides,
  };

  const skill: any = {
    metadata,
    execute: async () => {
      return { ok: true, data: "test result" };
    },
  };

  return skill;
}

describe("SkillRegistry", () => {
  let registry: SkillRegistry;

  beforeEach(() => {
    registry = SkillRegistry.getInstance();
    registry.clear();
  });

  describe("Registration", () => {
    it("should register a skill successfully", () => {
      const skill = createMockSkill("test.skill");
      const result = registry.register(skill);
      
      expect(result.success).toBe(true);
      expect(registry.get("test.skill")).toBeDefined();
    });

    it("should reject duplicate registration of same version", () => {
      const skill = createMockSkill("test.skill");
      registry.register(skill);
      const result = registry.register(skill);
      
      expect(result.success).toBe(false);
      expect((result as any).reason).toContain("already registered");
    });

    it("should allow force override of different version", () => {
      const skillV1 = createMockSkill("test.skill", { version: "1.0.0" });
      const skillV2 = createMockSkill("test.skill", { version: "2.0.0" });
      
      registry.register(skillV1);
      const result = registry.register(skillV2, undefined, true);
      
      expect(result.success).toBe(true);
      expect(registry.getMetadata("test.skill")?.version).toBe("2.0.0");
    });

    it("should accept registration for skill without special metadata", () => {
      const skill = createMockSkill("test.skill");
      expect(registry.register(skill).success).toBe(true);
    });
  });

  describe("Discovery", () => {
    beforeEach(() => {
      registry.register(createMockSkill("skill.a", { category: "Document", tags: ["tag1"] }));
      registry.register(createMockSkill("skill.b", { category: "Citation", tags: ["tag2"] }));
      registry.register(createMockSkill("skill.c", { category: "Research", offlineCapable: false }));
    });

    it("should get a skill by ID", () => {
      const skill = registry.get("skill.a");
      expect(skill).toBeDefined();
      expect(skill?.metadata.id).toBe("skill.a");
    });

    it("should return undefined for non-existent skill", () => {
      expect(registry.get("nonexistent")).toBeUndefined();
    });

    it("should return undefined for disabled skill", () => {
      registry.register(createMockSkill("skill.disabled"));
      registry.disable("skill.disabled");
      
      expect(registry.get("skill.disabled")).toBeUndefined();
    });

    it("should list all registered skills", () => {
      const skills = registry.list();
      expect(skills.length).toBe(3);
    });

    it("should query skills by category", () => {
      const documentSkills = registry.query({ category: "Document" });
      expect(documentSkills.length).toBe(1);
      expect(documentSkills[0].id).toBe("skill.a");
    });

    it("should query skills by offline capability", () => {
      const offlineSkills = registry.query({ offlineOnly: true });
      expect(offlineSkills.length).toBe(2);
    });

    it("should query skills by tag", () => {
      const tag1Skills = registry.query({ tag: "tag1" });
      expect(tag1Skills.length).toBe(1);
      expect(tag1Skills[0].id).toBe("skill.a");
    });

    it("should get metadata regardless of enabled state", () => {
      registry.disable("skill.b");
      const metadata = registry.getMetadata("skill.b");
      
      expect(metadata).toBeDefined();
      expect(metadata?.id).toBe("skill.b");
      // get() should return undefined for disabled
      expect(registry.get("skill.b")).toBeUndefined();
    });
  });

  describe("Enable/Disable", () => {
    it("should enable a skill", () => {
      registry.register(createMockSkill("test.enabled"));
      registry.disable("test.enabled");
      
      expect(registry.isEnabled("test.enabled")).toBe(false);
      registry.enable("test.enabled");
      expect(registry.isEnabled("test.enabled")).toBe(true);
    });

    it("should disable a skill", () => {
      registry.register(createMockSkill("test.disabled"));
      
      expect(registry.isEnabled("test.disabled")).toBe(true);
      registry.disable("test.disabled");
      expect(registry.isEnabled("test.disabled")).toBe(false);
    });

    it("should return false when enabling non-existent skill", () => {
      expect(registry.enable("nonexistent")).toBe(false);
    });

    it("should return false when disabling non-existent skill", () => {
      expect(registry.disable("nonexistent")).toBe(false);
    });
  });

  describe("Configuration", () => {
    it("should update skill configuration", () => {
      registry.register(createMockSkill("test.config"));
      registry.updateConfig("test.config", { maxItems: 100 });
      
      // Configuration should be retrievable via getConfig
      expect(registry.getConfig("test.config").maxItems).toBe(100);
    });

    it("should set and get global configuration", () => {
      registry.setGlobalConfig({ defaultTimeout: 5000 });
      registry.register(createMockSkill("test.global"));
      
      const config = registry.getConfig("test.global");
      expect(config.defaultTimeout).toBe(5000);
    });
  });

  describe("Event Emission", () => {
    it("should emit skill.registered event", () => {
      const handler = vi.fn();
      registry.on("skill.registered", handler);
      
      registry.register(createMockSkill("test.event") as any);
      
      expect(handler).toHaveBeenCalledWith({ skillId: "test.event", version: "1.0.0" });
    });

    it("should emit skill.unregistered event", () => {
      const handler = vi.fn();
      registry.on("skill.unregistered", handler);
      
      registry.register(createMockSkill("test.unreg") as any);
      registry.unregister("test.unreg");
      
      expect(handler).toHaveBeenCalledWith({ skillId: "test.unreg" });
    });

    it("should emit skill.enabled event", () => {
      const handler = vi.fn();
      registry.on("skill.enabled", handler);
      
      registry.register(createMockSkill("test.enabled.event") as any);
      registry.disable("test.enabled.event");
      registry.enable("test.enabled.event");
      
      expect(handler).toHaveBeenCalledWith({ skillId: "test.enabled.event" });
    });

    it("should emit skill.disabled event", () => {
      const handler = vi.fn();
      registry.on("skill.disabled", handler);
      
      registry.register(createMockSkill("test.disabled.event") as any);
      registry.disable("test.disabled.event");
      
      expect(handler).toHaveBeenCalledWith({ skillId: "test.disabled.event" });
    });

    it("should return unsubscribe function from on() that removes handler", () => {
      const handler = vi.fn();
      const unsubscribe = registry.on("skill.registered", handler);
      
      registry.register(createMockSkill("test.unsubscribe.1") as any);
      expect(handler).toHaveBeenCalledTimes(1);
      
      unsubscribe();
      
      registry.register(createMockSkill("test.unsubscribe.2") as any);
      // Handler should still have been called only once (unsubscribe worked)
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe("Dependencies", () => {
    it("should reject registration with missing dependencies", () => {
      const skillWithDeps = createMockSkill("skill.with.deps", {
        dependencies: ["missing.skill"],
      });
      
      const result = registry.register(skillWithDeps);
      expect(result.success).toBe(false);
      expect((result as any).reason).toContain("Missing dependencies");
    });

    it("should allow registration when dependencies exist", () => {
      registry.register(createMockSkill("dependency.skill"));
      
      const skillWithDeps = createMockSkill("skill.with.deps", {
        dependencies: ["dependency.skill"],
      });
      
      const result = registry.register(skillWithDeps);
      expect(result.success).toBe(true);
    });
  });

  describe("Get All IDs", () => {
    it("should return all skill IDs", () => {
      registry.register(createMockSkill("skill.id.a"));
      registry.register(createMockSkill("skill.id.b"));
      registry.register(createMockSkill("skill.id.c"));
      
      const ids = registry.getAllIds();
      ids.sort();
      expect(ids).toEqual(["skill.id.a", "skill.id.b", "skill.id.c"]);
    });

    it("should return empty array when no skills registered", () => {
      expect(registry.getAllIds()).toEqual([]);
    });
  });

  describe("Dependency Injection", () => {
    it("should create isolated registry instances via constructor", () => {
      const customLogger = {
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };
      
      const isolatedRegistry = new SkillRegistry(customLogger);
      const skill = createMockSkill("isolated.skill");
      
      isolatedRegistry.register(skill);
      
      // Isolated registry should have the skill
      expect(isolatedRegistry.get("isolated.skill")).toBeDefined();
      
      // Main registry should NOT have the skill (isolation verified)
      expect(registry.get("isolated.skill")).toBeUndefined();
    });

    it("should allow setting logger via DI method", () => {
      const newLogger = {
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };
      
      registry.setLogger(newLogger);
      expect(registry.getLogger()).toBe(newLogger);
    });

    it("should return default console logger when none provided", () => {
      const isolatedRegistry = new SkillRegistry();
      const logger = isolatedRegistry.getLogger();
      
      // Should have console-based methods
      expect(typeof logger.info).toBe("function");
      expect(typeof logger.debug).toBe("function");
      expect(typeof logger.warn).toBe("function");
      expect(typeof logger.error).toBe("function");
    });
  });
});