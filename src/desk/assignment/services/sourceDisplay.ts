import type { DiscoveredSource } from "../types";

/** The venue to show: the real journal/publisher, else a clean type badge. */
export function sourceVenueLabel(source: Pick<DiscoveredSource, "journal" | "publisher" | "type" | "retrievalSource" | "publicationStatus">): string {
  if (source.journal) return source.journal;
  if (source.publisher) return source.publisher;
  if (source.retrievalSource === "arxiv") return "arXiv Preprint";
  if (source.publicationStatus === "preprint") return "Preprint";
  switch (source.type) {
    case "book":
      return "Book";
    case "conference":
      return "Conference Paper";
    case "institutional":
      return "Institutional Report";
    case "journal":
      return "Journal Article";
    default:
      return "Publication";
  }
}
