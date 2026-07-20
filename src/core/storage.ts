import { err, ok, type Result } from "./result";

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function createMemoryStore(): KeyValueStore {
  const store = new Map<string, string>();
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
  };
}

export function createBrowserStorage(): KeyValueStore {
  if (typeof window === "undefined" || !window.localStorage) {
    return createMemoryStore();
  }

  try {
    const probeKey = "__scholar_storage_probe__";
    window.localStorage.setItem(probeKey, "1");
    window.localStorage.removeItem(probeKey);
    return window.localStorage;
  } catch {
    return createMemoryStore();
  }
}

export function readJson<T>(store: KeyValueStore, key: string): Result<T | null> {
  const raw = store.getItem(key);
  if (!raw) return ok(null);

  try {
    return ok(JSON.parse(raw) as T);
  } catch (error) {
    return err(error instanceof Error ? error : new Error(`Failed to parse JSON at key ${key}`));
  }
}

export function writeJson<T>(store: KeyValueStore, key: string, value: T): Result<void> {
  try {
    store.setItem(key, JSON.stringify(value));
    return ok(undefined);
  } catch (error) {
    return err(error instanceof Error ? error : new Error(`Failed to write JSON at key ${key}`));
  }
}

