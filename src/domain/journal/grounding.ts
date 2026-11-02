/**
 * Keeps only what the journal's own guidelines actually say. An AI extraction
 * can still slip in a "typical" value (a 250-word abstract, APA style) that
 * the pasted text never states; every value is checked against the text and
 * anything not found there is dropped and listed as unresolved, so the author
 * fills it in instead of trusting a guess. Pure; no I/O.
 */
import type { JournalRequirementsProposal } from "./types";

const norm = (s: string) => s.toLowerCase().replace(/[‐-―]/g, "-").replace(/\s+/g, " ");

/** "6,000", "6 000" and "6000" are the same number in a guideline. */
function textHasNumber(text: string, n: number): boolean {
  const digits = String(Math.round(n));
  const withSep = digits.replace(/\B(?=(\d{3})+(?!\d))/g, "[,  .]?");
  return new RegExp(`(^|[^\\d])${withSep}([^\\d]|$)`).test(text);
}

function textHasPhrase(text: string, phrase: string): boolean {
  const p = norm(phrase).trim();
  return p.length > 0 && norm(text).includes(p);
}

/** Distinctive words of a declaration type, e.g. "conflict of interest statement" → conflict, interest. */
const STOP = new Set(["statement", "statements", "declaration", "declarations", "section", "the", "of", "and", "a", "an", "to", "for", "on", "in"]);
function textHasDeclaration(text: string, declaration: string): boolean {
  const words = norm(declaration).split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));
  if (words.length === 0) return false;
  const t = norm(text);
  return words.every((w) => t.includes(w.replace(/s$/, "")));
}

export function groundProposal(proposal: JournalRequirementsProposal, guidelinesText: string): JournalRequirementsProposal {
  const text = guidelinesText;
  const unresolved = new Set(proposal.unresolvedFields);
  const out: JournalRequirementsProposal = { requiredDeclarations: [], unresolvedFields: [] };

  if (proposal.journalName) {
    if (textHasPhrase(text, proposal.journalName)) out.journalName = proposal.journalName;
    else unresolved.add("journalName");
  }
  if (proposal.articleType) {
    if (textHasPhrase(text, proposal.articleType)) out.articleType = proposal.articleType;
    else unresolved.add("articleType");
  }
  if (proposal.citationStyle) {
    if (textHasPhrase(text, proposal.citationStyle)) out.citationStyle = proposal.citationStyle;
    else unresolved.add("citationStyle");
  }
  if (proposal.wordLimit) {
    const min = proposal.wordLimit.min !== undefined && textHasNumber(text, proposal.wordLimit.min) ? proposal.wordLimit.min : undefined;
    const max = proposal.wordLimit.max !== undefined && textHasNumber(text, proposal.wordLimit.max) ? proposal.wordLimit.max : undefined;
    if (min !== undefined || max !== undefined) out.wordLimit = { ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}) };
    if ((proposal.wordLimit.min !== undefined && min === undefined) || (proposal.wordLimit.max !== undefined && max === undefined)) unresolved.add("wordLimit");
  }
  if (proposal.structureOverride?.length) {
    const kept = proposal.structureOverride.filter((s) => textHasPhrase(text, s));
    if (kept.length >= 2) out.structureOverride = kept;
    else unresolved.add("structureOverride");
  }
  const decls = proposal.requiredDeclarations.filter((d) => textHasDeclaration(text, d));
  out.requiredDeclarations = decls;
  if (decls.length < proposal.requiredDeclarations.length) unresolved.add("requiredDeclarations");
  if (proposal.notes) out.notes = proposal.notes;

  out.unresolvedFields = [...unresolved];
  return out;
}
