/**
 * Shared pieces for reference-list entries: name forms, initials, sentence
 * ends and DOI/URL. Pure. A missing field is left out, never filled in.
 */
import type { CanonicalReference, ReferenceAuthor } from "../model/reference";

/** Given names as initials: "John Andrew" -> ["J.", "A."], "Jean-Paul" -> ["J.-P."]. */
export function initialsOf(given: string | undefined): string[] {
  return (given || "")
    .split(/[\s.]+/)
    .filter(Boolean)
    .map((n) => n.split("-").filter(Boolean).map((p) => `${p.charAt(0).toUpperCase()}.`).join("-"));
}

/** "Smith, J.A." (Harvard: initials with no spaces). */
export function familyInitialsTight(a: ReferenceAuthor): string {
  const i = initialsOf(a.firstName).join("");
  return i ? `${a.lastName}, ${i}` : a.lastName;
}

/** "J. A. Smith" (IEEE). */
export function initialsFamily(a: ReferenceAuthor): string {
  const i = initialsOf(a.firstName).join(" ");
  return i ? `${i} ${a.lastName}` : a.lastName;
}

/** "Smith JA" (Vancouver). */
export function familyBareInitials(a: ReferenceAuthor): string {
  const i = initialsOf(a.firstName).map((x) => x.replace(/[.-]/g, "")).join("");
  return i ? `${a.lastName} ${i}` : a.lastName;
}

/** "Smith, John" (inverted, full given name). */
export function familyGiven(a: ReferenceAuthor): string {
  return a.firstName ? `${a.lastName}, ${a.firstName}` : a.lastName;
}

/** "John Smith" (natural order, full given name). */
export function givenFamily(a: ReferenceAuthor): string {
  return a.firstName ? `${a.firstName} ${a.lastName}` : a.lastName;
}

export function sortedAuthors(reference: CanonicalReference): ReferenceAuthor[] {
  return [...(reference.authors ?? [])].filter((a) => a && a.lastName).sort((x, y) => (x.order ?? 0) - (y.order ?? 0));
}

/** Join names as "A, B and C" (or with ", and" / "&" / no conjunction). */
export function joinNames(names: string[], conj: "and" | ", and" | "none" = "and"): string {
  if (names.length <= 1) return names[0] ?? "";
  if (conj === "none") return names.join(", ");
  if (names.length === 2) return conj === ", and" ? `${names[0]}, and ${names[1]}` : `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}${conj === ", and" ? ", and" : " and"} ${names[names.length - 1]}`;
}

/** Add a full stop unless the text already ends a sentence. */
export function endSentence(text: string): string {
  const t = text.trim();
  return /[.?!]$/.test(t) ? t : `${t}.`;
}

/** A quoted title with the sentence-ending mark inside the quotes ("Title." / "Why?"). */
export function quotedTitle(title: string, mark: "." | ","): string {
  const t = title.trim();
  return /[.?!]$/.test(t) ? `"${t}"` : `"${t}${mark}"`;
}

export function doiUrl(reference: CanonicalReference): string {
  if (reference.doi) return reference.doi.startsWith("http") ? reference.doi : `https://doi.org/${reference.doi}`;
  return reference.url ?? "";
}

export function bareDoi(reference: CanonicalReference): string {
  return (reference.doi ?? "").replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");
}

export function journalOf(reference: CanonicalReference): string {
  return reference.journal || reference.source || "";
}

export function publisherOf(reference: CanonicalReference): string {
  return reference.publisher || reference.source || "";
}

/** "45–67" (an en dash between page numbers). */
export function pageRange(pages: string | undefined): string {
  return (pages ?? "").replace(/\s*[-–—]+\s*/g, "–");
}
