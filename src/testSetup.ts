import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Without this, @testing-library/react's own automatic cleanup never fires:
// it registers via the global `afterEach`, which only exists on `globalThis`
// when vitest's `test.globals` is enabled — this project intentionally keeps
// that off and imports test globals explicitly per file instead. The result
// was every render()/renderHook() tree across all ~106 test files staying
// mounted after its test finished, so any in-flight effect (e.g. an async
// storage load) could resolve and call setState during a LATER test file's
// run, after that later file's jsdom environment had already replaced
// globalThis.window — surfacing as an intermittent "window is not defined"
// unhandled exception (Node 22 CI only, timing-dependent; see
// useProjectPersistence.ts's loadAllProjects guard for one specific instance
// of this same class of leak). Unmounting after every test is the standard,
// documented fix for this exact situation.
afterEach(() => {
  cleanup();
});

// Polyfill localStorage for jsdom environments where it is missing
if (typeof globalThis !== "undefined" && !globalThis.localStorage) {
  let storage: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (key: string) => storage[key] ?? null,
    setItem: (key: string, value: string) => { storage[key] = value; },
    removeItem: (key: string) => { delete storage[key]; },
    clear: () => { storage = {}; },
    get length() { return Object.keys(storage).length; },
    key: (index: number) => Object.keys(storage)[index] ?? null
  };
}
