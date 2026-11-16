import type { AssignmentSubheading } from "../../types";
import { ReferenceBarItem } from "../../ReferenceBarItem";
import { CuratedSourceCard } from "../CuratedSourceCard";
import type {
DiscoveredSource
} from "../../types";
import {
RotateCcw
} from "lucide-react";
import { isSourceApproved } from "../../../../domain/assignment/approvedSources";

export interface SourcesCatalogProps {
  approvedSourceIds: string[];
  bookmarkedIds: string[];
  citationStyle: string;
  displayedSources: DiscoveredSource[];
  handleDismissSource: (sourceId: string) => Promise<void>;
  handleSaveSourceUpdates: (sourceId: string, updates: Partial<DiscoveredSource>) => Promise<void>;
  handleToggleApproval: (sourceId: string) => Promise<void>;
  handleToggleBookmark: (sourceId: string) => Promise<void>;
  resetAllFilters: () => void;
  subheadings: AssignmentSubheading[];
  viewMode: "bar" | "card";
}

export function SourcesCatalog({ approvedSourceIds, bookmarkedIds, citationStyle, displayedSources, handleDismissSource, handleSaveSourceUpdates, handleToggleApproval, handleToggleBookmark, resetAllFilters, subheadings, viewMode }: SourcesCatalogProps) {
  return (
    <>
            {/* Streamlined Literature Catalog (Apple-Inspired Minimalist Horizontal Reference Bars) */}
            {displayedSources.length > 0 ? (
              <div
                className="flex flex-col gap-1.5"
                data-testid="curated-sources-grid"
              >
                {displayedSources.map((source) =>
                  viewMode === "card" ? (
                    <CuratedSourceCard
                      key={source.id}
                      source={source}
                      isApproved={isSourceApproved(source, approvedSourceIds)}
                      isBookmarked={bookmarkedIds.includes(source.id)}
                      onToggleApproval={handleToggleApproval}
                      onDismiss={handleDismissSource}
                      onToggleBookmark={handleToggleBookmark}
                      onSaveEdit={handleSaveSourceUpdates}
                      availableSubheadings={subheadings}
                      onUpdateSubheadingMapping={(sId, mapping) =>
                        handleSaveSourceUpdates(sId, { mappedSubheadingIds: mapping })
                      }
                      onUpdateUserNotes={(sId, notes) =>
                        handleSaveSourceUpdates(sId, { userNotes: notes })
                      }
                    />
                  ) : (
                    <ReferenceBarItem
                      citationStyle={citationStyle || "harvard"}
                      key={source.id}
                      source={source}
                      isApproved={isSourceApproved(source, approvedSourceIds)}
                      isBookmarked={bookmarkedIds.includes(source.id)}
                      onToggleApproval={handleToggleApproval}
                      onDismiss={handleDismissSource}
                      onToggleBookmark={handleToggleBookmark}
                      onSaveEdit={handleSaveSourceUpdates}
                      showDismiss={true}
                    />
                  )
                )}
              </div>
            ) : (
              <div className="p-10 text-center rounded-2xl border border-dashed border-[color:var(--border-subtle)] space-y-3">
                <p className="text-sm font-medium text-[color:var(--text-secondary)]">
                  No literature sources match your current filter parameters.
                </p>
                <p className="text-xs text-[color:var(--text-muted)]">
                  Try clearing active filters or searching for broader conceptual keywords.
                </p>
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="px-4 py-2 rounded-full text-xs font-semibold bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] hover:opacity-90 transition-opacity cursor-pointer inline-flex items-center gap-1.5 shadow-xs dark:shadow-none"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset all filters to view all literature</span>
                </button>
              </div>
            )}
    </>
  );
}
