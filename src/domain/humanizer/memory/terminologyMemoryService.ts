/**
 * Cross-Session Terminology Memory Service.
 *
 * Manages deterministic precedence hierarchy (DOCUMENT > PROJECT > USER > SYSTEM),
 * conflict detection, promotion actions, and persistence without manuscript pollution.
 */

import {
  TerminologyMemoryEntry,
  TerminologyScope,
  TerminologyConflict,
} from "../types";

const STORAGE_KEY_PREFIX = "scholar_core_terminology_";

/**
 * Creates a structured TerminologyMemoryEntry.
 */
export function createTerminologyEntry(params: {
  term: string;
  scope: TerminologyScope;
  preferredForm?: string;
  alternatives?: string[];
  projectId?: string;
  userId?: string;
  locked?: boolean;
  caseSensitive?: boolean;
}): TerminologyMemoryEntry {
  const cleanTerm = params.term.trim();
  const id = `term_${params.scope.toLowerCase()}_${cleanTerm.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;

  return {
    id,
    term: cleanTerm,
    preferredForm: params.preferredForm?.trim(),
    alternatives: params.alternatives?.map((a) => a.trim()).filter(Boolean) || [],
    scope: params.scope,
    projectId: params.projectId,
    userId: params.userId,
    locked: params.locked ?? true,
    caseSensitive: params.caseSensitive ?? false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    usageCount: 1,
    status: "ACTIVE",
  };
}

/**
 * Resolves terminology entries across scopes with deterministic precedence:
 * DOCUMENT > PROJECT > USER > SYSTEM
 */
export function resolveTerminologyHierarchy(params: {
  documentEntries?: TerminologyMemoryEntry[];
  projectEntries?: TerminologyMemoryEntry[];
  userEntries?: TerminologyMemoryEntry[];
  systemEntries?: TerminologyMemoryEntry[];
}): {
  resolvedLockedTerms: string[];
  activeEntries: TerminologyMemoryEntry[];
  conflicts: TerminologyConflict[];
} {
  const docList = params.documentEntries || [];
  const projList = params.projectEntries || [];
  const userList = params.userEntries || [];
  const sysList = params.systemEntries || [];

  const conflicts: TerminologyConflict[] = [];
  const entriesByNormalizedTerm = new Map<string, TerminologyMemoryEntry>();

  const scopeRank: Record<TerminologyScope, number> = {
    DOCUMENT: 4,
    PROJECT: 3,
    USER: 2,
    SYSTEM: 1,
  };

  // Process from lowest to highest precedence
  const allLayers: { scope: TerminologyScope; entries: TerminologyMemoryEntry[] }[] = [
    { scope: "SYSTEM", entries: sysList },
    { scope: "USER", entries: userList },
    { scope: "PROJECT", entries: projList },
    { scope: "DOCUMENT", entries: docList },
  ];

  for (const layer of allLayers) {
    for (const entry of layer.entries) {
      const key = entry.term.toLowerCase();
      const existing = entriesByNormalizedTerm.get(key);

      if (existing) {
        // Compare with existing lower-priority entry for conflict
        const isConflict =
          existing.preferredForm !== entry.preferredForm ||
          existing.locked !== entry.locked;

        if (isConflict) {
          conflicts.push({
            term: entry.term,
            higherScope: layer.scope,
            lowerScope: existing.scope,
            higherEntry: entry,
            lowerEntry: existing,
            resolution: "HIGHER_SCOPE_APPLIED",
            description: `${layer.scope} entry "${entry.term}" overrides conflicting ${existing.scope} entry.`,
          });
        }
      }

      // Higher scope overwrites lower scope
      entriesByNormalizedTerm.set(key, entry);
    }
  }

  const activeEntries = Array.from(entriesByNormalizedTerm.values());
  const resolvedLockedTerms = activeEntries
    .filter((e) => e.locked)
    .map((e) => e.term);

  return {
    resolvedLockedTerms,
    activeEntries,
    conflicts,
  };
}

/**
 * Promotes a document-scoped term to PROJECT or USER scope without mutating the original document entry.
 */
export function promoteTerminologyEntry(
  entry: TerminologyMemoryEntry,
  targetScope: "PROJECT" | "USER",
  targetId?: { projectId?: string; userId?: string }
): TerminologyMemoryEntry {
  return {
    ...entry,
    id: `term_${targetScope.toLowerCase()}_${entry.term.toLowerCase().replace(/[^a-z0-9]/g, "_")}`,
    scope: targetScope,
    projectId: targetId?.projectId || entry.projectId,
    userId: targetId?.userId || entry.userId,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Saves a terminology entry to persistent storage (localStorage / API).
 */
export function savePersistentTerminology(
  entry: TerminologyMemoryEntry,
  targetId?: string
): void {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    const storageKey = `${STORAGE_KEY_PREFIX}${entry.scope.toLowerCase()}_${targetId || "global"}`;
    const raw = window.localStorage.getItem(storageKey);
    const existing: TerminologyMemoryEntry[] = raw ? JSON.parse(raw) : [];

    const filtered = existing.filter((e) => e.id !== entry.id && e.term.toLowerCase() !== entry.term.toLowerCase());
    filtered.push(entry);

    window.localStorage.setItem(storageKey, JSON.stringify(filtered));
  } catch (_) {}
}

/**
 * Loads persistent terminology entries for a given scope and target ID.
 */
export function loadPersistentTerminology(
  scope: "PROJECT" | "USER",
  targetId?: string
): TerminologyMemoryEntry[] {
  try {
    if (typeof window === "undefined" || !window.localStorage) return [];
    const storageKey = `${STORAGE_KEY_PREFIX}${scope.toLowerCase()}_${targetId || "global"}`;
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (_) {
    return [];
  }
}
