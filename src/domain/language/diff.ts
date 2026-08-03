/**
 * Word-level diff construction — turns (original, refined) text pairs into
 * DiffChange hunks. Used to build the per-change reviewable diff (docs
 * 32-LANGUAGE-AND-VOICE-ARCHITECTURE.md §7) from a model-backed level's
 * output, since a model returns full replacement text, not a hunk list.
 *
 * Implementation: a standard LCS (longest common subsequence) over
 * whitespace-preserving word tokens, producing minimal insert/delete/replace
 * runs. This is intentionally simple rather than a full Myers diff — the
 * passages the Studio operates on are section/paragraph scoped
 * (typically well under a few hundred words), where O(n*m) LCS is fast
 * enough and easy to verify correct.
 */

import type { ChangeCategory, DiffChange } from "./types";

/** Tokenise preserving whitespace as its own tokens, so reconstruction is exact. */
function tokenize(text: string): string[] {
  return text.match(/\s+|[^\s]+/g) ?? [];
}

interface Op {
  kind: "equal" | "replace";
  originalTokens: string[];
  replacementTokens: string[];
}

/** Compute the LCS-based token-level edit script between two token arrays. */
function diffTokens(a: string[], b: string[]): Op[] {
  const n = a.length;
  const m = b.length;
  // dp[i][j] = length of LCS of a[i..] and b[j..]
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  let pendingOrig: string[] = [];
  let pendingRepl: string[] = [];

  function flushReplace() {
    if (pendingOrig.length || pendingRepl.length) {
      ops.push({ kind: "replace", originalTokens: pendingOrig, replacementTokens: pendingRepl });
      pendingOrig = [];
      pendingRepl = [];
    }
  }

  while (i < n && j < m) {
    if (a[i] === b[j]) {
      flushReplace();
      ops.push({ kind: "equal", originalTokens: [a[i]], replacementTokens: [b[j]] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      pendingOrig.push(a[i]);
      i++;
    } else {
      pendingRepl.push(b[j]);
      j++;
    }
  }
  while (i < n) {
    pendingOrig.push(a[i]);
    i++;
  }
  while (j < m) {
    pendingRepl.push(b[j]);
    j++;
  }
  flushReplace();

  return ops;
}

/** Merge adjacent "equal" ops into single runs, so the result is compact. */
function coalesce(ops: Op[]): Op[] {
  const out: Op[] = [];
  for (const op of ops) {
    const prev = out[out.length - 1];
    if (prev && prev.kind === op.kind) {
      prev.originalTokens.push(...op.originalTokens);
      prev.replacementTokens.push(...op.replacementTokens);
    } else {
      out.push({ kind: op.kind, originalTokens: [...op.originalTokens], replacementTokens: [...op.replacementTokens] });
    }
  }
  return out;
}

let counter = 0;
function nextId(): string {
  counter += 1;
  return `diff-${counter}`;
}

export function __resetDiffIdsForTests(): void {
  counter = 0;
}

/**
 * Build DiffChange hunks between original and replacement text. Every
 * non-equal op becomes one hunk with `category` and `reason` supplied by the
 * caller (app/studio assigns "language" vs "content" per hunk after stage-4
 * meaning verification runs — this function only handles the mechanical
 * diffing, not the judgement about what kind of change it is).
 */
export function buildDiff(
  original: string,
  replacement: string,
  reasonFor: (originalText: string, replacementText: string) => string,
  category: ChangeCategory = "language"
): DiffChange[] {
  const ops = coalesce(diffTokens(tokenize(original), tokenize(replacement)));
  const changes: DiffChange[] = [];
  let cursor = 0;
  for (const op of ops) {
    const origText = op.originalTokens.join("");
    if (op.kind === "equal") {
      cursor += origText.length;
      continue;
    }
    const replText = op.replacementTokens.join("");
    if (origText === replText) {
      cursor += origText.length;
      continue;
    }
    changes.push({
      id: nextId(),
      category,
      originalStart: cursor,
      originalEnd: cursor + origText.length,
      originalText: origText,
      replacementText: replText,
      reason: reasonFor(origText, replText),
    });
    cursor += origText.length;
  }
  return changes;
}

/** Apply a set of DiffChange hunks to the original text, honouring only accepted ids. */
export function applyChanges(original: string, changes: DiffChange[], acceptedIds: Set<string>): string {
  const sorted = [...changes].sort((a, b) => a.originalStart - b.originalStart);
  let result = "";
  let cursor = 0;
  for (const change of sorted) {
    result += original.slice(cursor, change.originalStart);
    result += acceptedIds.has(change.id) ? change.replacementText : change.originalText;
    cursor = change.originalEnd;
  }
  result += original.slice(cursor);
  return result;
}
