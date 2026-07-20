/**
 * Skills Framework - Registry
 * 
 * Manages skill registration, discovery, and lifecycle.
 * Provides a central point for skill management and version support.
 * 
 * REFACTORED: Supports dependency injection while maintaining backward compatibility.
 * The singleton pattern is preserved via getInstance(), but public constructor
 * allows creating isolated registry instances for testing/plugin loading.
 * 
 * @packageDocumentation
 */

import type { Skill, SkillEntry, SkillQuery, SkillMetadata, SkillConfig, SkillContext, SkillLogger } from "./types";

// ============================================================================
// Registry Events
// ============================================================================

export interface SkillRegistryEvents {
  "skill.registered": { skillId: string; version: string };
  "skill.unregistered": { skillId: string };
  "skill.enabled": { skillId: string };
  "skill.disabled": { skillId: string };
  "skill.error": { skillId: string; error: string };
}

// ============================================================================
// Registry Implementation
// ============================================================================

type EventHandler<T> = (payload: T) => void;

export class SkillRegistry {
  private static instance: SkillRegistry;
  private skills: Map<string, SkillEntry> = new Map();
  private eventHandlers: Map<string, Set<EventHandler<any>>> = new Map();
  private globalConfig: SkillConfig = {};
  
  // Injected dependencies for DI support
  private logger: SkillLogger;

  /**
   * Create a new SkillRegistry instance.
   * Allows dependency injection for isolated contexts.
   */
  constructor(logger?: SkillLogger) {
    // Default logger uses console fallback if not provided
    this.logger = logger ?? {
      info: (...args: unknown[]) => console.log("[SkillRegistry]", ...args),
      debug: (...args: unknown[]) => console.debug("[SkillRegistry]", ...args),
      warn: (...args: unknown[]) => console.warn("[SkillRegistry]", ...args),
      error: (...args: unknown[]) => console.error("[SkillRegistry]", ...args),
    };
  }

  /**
   * Get the singleton instance (backward compatibility).
   * For new code, consider creating instances directly.
   */
  static getInstance(): SkillRegistry {
    if (!SkillRegistry.instance) {
      SkillRegistry.instance = new SkillRegistry();
    }
    return SkillRegistry.instance;
  }

  // ============================================================================
  // Event Management
  // ============================================================================

  on<K extends keyof SkillRegistryEvents>(
    event: K,
    handler: EventHandler<SkillRegistryEvents[K]>
  ): () => void {
    const handlers = this.eventHandlers.get(event as string) ?? new Set();
    handlers.add(handler);
    this.eventHandlers.set(event as string, handlers);
    return () => handlers.delete(handler);
  }

  private emit<K extends keyof SkillRegistryEvents>(event: K, payload: SkillRegistryEvents[K]): void {
    this.eventHandlers.get(event as string)?.forEach((handler) => handler(payload));
  }

  // ============================================================================
  // Registration
  // ============================================================================

  register(
    skill: Skill,
    config?: SkillConfig,
    force = false
  ): { success: true } | { success: false; reason: string } {
    const { id, version } = skill.metadata;

    const existing = this.skills.get(id);
    if (existing && !force) {
      if (existing.skill.metadata.version === version) {
        this.logger.info!(`Skill ${id} v${version} already registered`);
        return { success: false, reason: `Skill ${id} v${version} already registered` };
      }
      this.logger.warn!(`Skill ${id} already registered with different version. Use force=true to override.`);
      return { success: false, reason: `Skill ${id} already registered with different version` };
    }

    const depErrors = this.validateDependencies(skill.metadata);
    if (depErrors.length > 0) {
      return { success: false, reason: `Missing dependencies: ${depErrors.join(", ")}` };
    }

    const entry: SkillEntry = {
      skill,
      registeredAt: new Date().toISOString(),
      enabled: true,
      config,
    };

    this.skills.set(id, entry);
    this.emit("skill.registered", { skillId: id, version });
    this.logger.info!(`Registered skill: ${id} v${version}`);

    if (skill.onRegister) {
      const context = this.createContext(id);
      const result = skill.onRegister(context);
      if (result instanceof Promise) {
        void result.catch((err: unknown) => {
          this.logger.error!(`Error in onRegister hook for ${id}:`, err);
          this.emit("skill.error", { skillId: id, error: String(err) });
        });
      }
    }

    return { success: true };
  }

  unregister(id: string): boolean {
    const entry = this.skills.get(id);
    if (!entry) {
      return false;
    }

    if (entry.skill.onUnregister) {
      const context = this.createContext(id);
      const result = entry.skill.onUnregister(context);
      if (result instanceof Promise) {
        void result.catch((err: unknown) => {
          this.logger.error!(`Error in onUnregister hook for ${id}:`, err);
        });
      }
    }

    this.skills.delete(id);
    this.emit("skill.unregistered", { skillId: id });
    this.logger.info!(`Unregistered skill: ${id}`);
    return true;
  }

  // ============================================================================
  // Discovery
  // ============================================================================

  get(id: string): Skill | undefined {
    const entry = this.skills.get(id);
    return entry?.enabled ? entry.skill : undefined;
  }

  getMetadata(id: string): SkillMetadata | undefined {
    return this.skills.get(id)?.skill.metadata;
  }

  list(): SkillMetadata[] {
    return Array.from(this.skills.values()).map((entry) => entry.skill.metadata);
  }

  query(options: SkillQuery): SkillMetadata[] {
    return this.list().filter((metadata) => {
      if (options.category && metadata.category !== options.category) {
        return false;
      }
      if (options.offlineOnly && !metadata.offlineCapable) {
        return false;
      }
      if (options.aiEnhancedOnly && !metadata.aiEnhanced) {
        return false;
      }
      if (options.tag && (!metadata.tags || !metadata.tags.includes(options.tag))) {
        return false;
      }
      return true;
    });
  }

  getAllIds(): string[] {
    return Array.from(this.skills.keys());
  }

  // ============================================================================
  // Enable/Disable
  // ============================================================================

  enable(id: string): boolean {
    const entry = this.skills.get(id);
    if (!entry) {
      return false;
    }
    entry.enabled = true;
    this.emit("skill.enabled", { skillId: id });
    this.logger.info!(`Enabled skill: ${id}`);
    return true;
  }

  disable(id: string): boolean {
    const entry = this.skills.get(id);
    if (!entry) {
      return false;
    }
    entry.enabled = false;
    this.emit("skill.disabled", { skillId: id });
    this.logger.info!(`Disabled skill: ${id}`);
    return true;
  }

  isEnabled(id: string): boolean {
    return this.skills.get(id)?.enabled ?? false;
  }

  // ============================================================================
  // Configuration
  // ============================================================================

  updateConfig(id: string, config: SkillConfig): boolean {
    const entry = this.skills.get(id);
    if (!entry) {
      return false;
    }
    entry.config = { ...entry.config, ...config };
    return true;
  }

  setGlobalConfig(config: SkillConfig): void {
    this.globalConfig = { ...this.globalConfig, ...config };
  }

  getConfig(id: string): SkillConfig {
    const skillConfig = this.skills.get(id)?.config ?? {};
    return { ...this.globalConfig, ...skillConfig };
  }

  // ============================================================================
  // Dependency Injection
  // ============================================================================

  setLogger(logger: SkillLogger): void {
    this.logger = logger;
  }

  getLogger(): SkillLogger {
    return this.logger;
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private validateDependencies(metadata: SkillMetadata): string[] {
    const missing: string[] = [];
    if (!metadata.dependencies) return missing;

    for (const depId of metadata.dependencies) {
      if (!this.skills.has(depId)) {
        missing.push(depId);
      }
    }
    return missing;
  }

  private createContext(skillId: string): SkillContext {
    return {
      logger: {
        debug: (...args: unknown[]) => this.logger.debug?.(`[${skillId}]`, ...args),
        info: (...args: unknown[]) => this.logger.info?.(`[${skillId}]`, ...args),
        warn: (...args: unknown[]) => this.logger.warn?.(`[${skillId}]`, ...args),
        error: (...args: unknown[]) => this.logger.error?.(`[${skillId}]`, ...args),
      },
      config: this.getConfig(skillId),
      emit: (event, payload) => {
        this.emit(event as any, payload);
      },
      hasPermission: () => true,
    };
  }

  clear(): void {
    this.skills.clear();
    this.logger.debug!("Registry cleared");
  }
}