/** DiscoveredSource -> the shared CanonicalReference (citation_compliance). Pure. */
import type { CanonicalReference, ReferenceAuthor, ReferenceKind } from "../../../citation_compliance/model/reference";
import type { DiscoveredSource } from "../types";
import { parsePersonName } from "./personName";

/**
 * Converts one author string into a ReferenceAuthor using the workspace's one
 * name parser (parsePersonName): "Family, Given", "Given Family", particles and
 * "et al." are all handled the same way as in the reference list.
 */
export function parseAuthorStringToCanonical(authorStr: string, order: number): ReferenceAuthor {
  const parsed = parsePersonName(authorStr || "");
  if (!parsed.family) return { firstName: "", lastName: "[Author unknown]", order };
  return { firstName: parsed.given, lastName: parsed.family, order };
}

/**
 * Maps DiscoveredSource or partial source data to CanonicalReference
 */
export function discoveredSourceToCanonical(source: Partial<DiscoveredSource>): CanonicalReference {
  const rawAuthors = (source as any).authors;
  const authorStrings: string[] = Array.isArray(rawAuthors)
    ? rawAuthors
    : typeof rawAuthors === "string" && rawAuthors.trim()
    ? [rawAuthors.trim()]
    : [];

  const authors: ReferenceAuthor[] =
    authorStrings.length > 0
      ? authorStrings.map((a, idx) => parseAuthorStringToCanonical(a, idx + 1))
      : [{ firstName: "", lastName: source.isUserUploaded ? "Course Materials" : "[Author unknown]", order: 1 }];

  let kind: ReferenceKind = "JournalArticle";
  if (source.type === "book") kind = "Book";
  else if (source.type === "conference") kind = "ConferencePaper";
  else if (source.type === "institutional" || source.type === "report") kind = "TechnicalReport";
  else if (source.type === "web") kind = "Website";

  // A missing venue stays missing; it is never given a made-up name.
  const containerSource = source.journal || source.publisher || "";

  return {
    kind,
    title: source.title || "Untitled Scholarly Work",
    authors,
    source: containerSource,
    publisher: source.publisher,
    journal: source.journal,
    year: source.year || "n.d.",
    // "12(3)" in volumeIssue fills volume/issue when they are not stored separately.
    volume: source.volume || source.volumeIssue?.match(/^\s*(?:vol\.?\s*)?(\w+)/i)?.[1],
    issue: source.issue || source.volumeIssue?.match(/\(([^)]+)\)/)?.[1],
    pages: source.pages,
    doi: source.doi,
    url: source.url,
  };
}
