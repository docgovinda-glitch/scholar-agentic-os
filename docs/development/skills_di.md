# Skills Framework - Dependency Injection

**Version:** 1.0.0  
**Last Updated:** 2026-07-13

---

## Overview

The Skills Framework has been refactored to support dependency injection while maintaining backward compatibility with the singleton pattern. This enables:

- **Dependency Injection:** Logger, configuration, and other services can be injected
- **Testing:** Isolated registry instances for unit tests without affecting global state
- **Multiple Contexts:** Different registry instances for server, worker, or plugin environments
- **Mobile Compatibility:** Reduced coupling for React Native or mobile applications

---

## Why Singleton Coupling Was Removed

The original `SkillRegistry.getInstance()` only created a single global instance. This created several issues:

1. **Testing Pollution:** Tests would share state through the singleton, requiring careful cleanup
2. **No Context Isolation:** Could not have separate registries for different execution contexts
3. **Hard Dependencies:** The singleton had an implicit dependency on the global logger
4. **Plugin Loading:** Could not support isolated plugin skill registries

---

## How Dependency Injection Works

### Constructor Injection

```typescript
import { SkillRegistry } from "../registry";

// Create an isolated registry with a custom logger
const customLogger = {
  info: (...args) => console.log("[MyLogger]", ...args),
  debug: (...args) => console.debug("[MyLogger]", ...args),
  warn: (...args) => console.warn("[MyLogger]", ...args),
  error: (...args) => console.error("[MyLogger]", ...args),
};

const isolatedRegistry = new SkillRegistry(customLogger);
```

### Setter Injection

```typescript
// For existing instances, use setLogger()
registry.setLogger({
  info: (...args) => myTelemetry.track("info", ...args),
  // ...
});
```

### Backward Compatibility

```typescript
// Existing code continues to work
const registry = SkillRegistry.getInstance(); // Still returns the singleton

// You can still use it the same way
registry.register(mySkill);
const skill = registry.get("my.skill.id");
```

---

## How New Skills Receive Dependencies

Skills receive their dependencies through the `SkillContext` object:

```typescript
const mySkill: Skill<MyInput, MyOutput> = {
  metadata: { /* ... */ },
  
  async execute(input, context) {
    // Access injected dependencies
    context.logger.info("Processing...", { config: context.config });
    
    // Emit events
    context.emit("skill.completed", { skillId: this.metadata.id });
    
    // Check permissions
    if (!context.hasPermission("write")) {
      return { ok: false, error: { type: "PERMISSION_ERROR", message: "No write permission" } };
    }
    
    // ... rest of implementation
  }
};
```

---

## Best Practices

1. **For Application Code:** Use `SkillRegistry.getInstance()` for the shared global registry
2. **For Testing:** Create isolated instances with `new SkillRegistry()` to avoid test pollution
3. **For Plugins:** Create dedicated registry instances for plugin-specific skills
4. **For Workers:** Each worker process can have its own isolated registry

---

## API Reference

### `new SkillRegistry(logger?)`

Creates a new SkillRegistry instance.

- `logger` (optional): Custom logger implementing `{ info, debug, warn, error }`
- Returns: A new SkillRegistry instance

### `SkillRegistry.getInstance()`

Returns the global singleton instance. Creates it lazily if needed.

- Returns: The global SkillRegistry instance

### `setLogger(logger)`

Updates the registry's logger instance.

- `logger`: A SkillLogger object

### `getLogger()`

Returns the current logger instance.

- Returns: The current SkillLogger

---

## Migration Guide

No migration is required for existing code. The singleton pattern remains the default behavior through `getInstance()`.

For code that wants to use DI:

1. Replace `SkillRegistry.getInstance()` with `new SkillRegistry(customLogger)` where needed
2. Pass the registry instance explicitly to functions that need it
3. Skills will receive injected dependencies through their context automatically