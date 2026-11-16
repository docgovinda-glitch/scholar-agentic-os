import React from "react";
import {
Plus
} from "lucide-react";

export interface StructureAddHeadingProps {
  handleCreateHeading: () => void;
  isAddingHeading: boolean;
  newHeadingTitle: string;
  setIsAddingHeading: (value: React.SetStateAction<boolean>) => void;
  setNewHeadingTitle: (value: React.SetStateAction<string>) => void;
}

export function StructureAddHeading({ handleCreateHeading, isAddingHeading, newHeadingTitle, setIsAddingHeading, setNewHeadingTitle }: StructureAddHeadingProps) {
  return (
    <>
        {/* Add Main Heading Button / Form */}
        <div className="pt-1">
          {isAddingHeading ? (
            <div className="p-3.5 rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] space-y-2.5 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[color:var(--text-primary)]">
                  New Main Analytical Heading
                </span>
                <button
                  type="button"
                  onClick={() => setIsAddingHeading(false)}
                  className="text-xs text-[color:var(--text-muted)] hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer"
                >
                  Cancel
                </button>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newHeadingTitle}
                  onChange={(e) => setNewHeadingTitle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateHeading()}
                  placeholder="e.g. Geopolitical Implications & Security Architecture"
                  className="flex-1 bg-[color:var(--surface-inset)] border border-[color:var(--border-subtle)] rounded-lg px-3 py-1.5 text-xs text-[color:var(--text-primary)] placeholder-neutral-400 focus:outline-none focus:border-neutral-400"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleCreateHeading}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] hover:opacity-90 transition-opacity cursor-pointer"
                >
                  Add Heading
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsAddingHeading(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] border border-dashed border-[color:var(--border-default)] transition-colors cursor-pointer w-full justify-center"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Main Analytical Heading</span>
            </button>
          )}
        </div>
    </>
  );
}
