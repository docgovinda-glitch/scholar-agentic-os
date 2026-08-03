/**
 * Content classification — the first Warden stage.
 *
 * Classification is deterministic and conservative: ambiguity resolves to the
 * higher (more sensitive) class, never the lower. Getting this wrong in the
 * "too strict" direction costs a consent prompt; getting it wrong in the
 * "too permissive" direction leaks user content. See
 * docs/04-architecture/41-AI-ARCHITECTURE.md §5.2.
 */

import type { EgressClass, TaskClass } from "./types";

/**
 * Task classes whose payload is, by construction, drawn from the user's own
 * manuscript, notes, or Vault rather than from public/bibliographic sources.
 */
const CONTENT_BEARING_TASKS: ReadonlySet<TaskClass> = new Set([
  "drafting",
  "refinement",
  "chat",
  "summarisation",
  "embedding",
]);

/**
 * Classify a single segment's label + text. Callers pass a `taskClass` so a
 * segment from a `rule_extraction` call (usually a public guidelines PDF)
 * doesn't get over-classified just because it *could* contain user text.
 */
export function classifySegment(
  taskClass: TaskClass,
  label: string,
  text: string,
  explicitClass?: EgressClass
): EgressClass {
  if (explicitClass) return explicitClass;

  const l = label.toLowerCase();

  // Explicit marking always wins, and always upward.
  if (l.includes("restricted")) return "restricted";

  if (l.includes("citation") || l.includes("metadata") || l.includes("reference")) {
    return "bibliographic";
  }
  if (l.includes("query") || l.includes("outline") || l.includes("statistic")) {
    return "derived";
  }
  if (l.includes("guideline") || l.includes("public") || l.includes("published")) {
    return "public";
  }

  // Task-class default: content-bearing tasks assume the worst case.
  if (CONTENT_BEARING_TASKS.has(taskClass)) return "user_content";

  if (taskClass === "rule_extraction" || taskClass === "discovery") return "public";
  if (taskClass === "verification") return "derived";

  // Unknown / unmatched: fail toward the stricter class per §5.2.
  return "user_content";
}

/** The highest-sensitivity class among a set — governs the whole request. */
export function highestClass(classes: EgressClass[]): EgressClass {
  const order: EgressClass[] = ["public", "bibliographic", "derived", "user_content", "restricted"];
  let highestIdx = 0;
  for (const c of classes) {
    const idx = order.indexOf(c);
    if (idx > highestIdx) highestIdx = idx;
  }
  return order[highestIdx];
}
