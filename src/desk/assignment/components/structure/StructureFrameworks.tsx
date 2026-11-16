import React from "react";
import {
Layers,X
} from "lucide-react";
import type {
AssignmentStructure
} from "../../types";

export interface StructureFrameworksProps {
  handleAddFramework: (name: string) => void;
  handleRemoveFramework: (index: number) => void;
  newFramework: string;
  setNewFramework: (value: React.SetStateAction<string>) => void;
  structure: AssignmentStructure;
}

export function StructureFrameworks({ handleAddFramework, handleRemoveFramework, newFramework, setNewFramework, structure }: StructureFrameworksProps) {
  return (
    <>
        {/* Theoretical Frameworks & Analytical Models */}
        {(() => {
          const frameworksList = Array.isArray(structure.targetFrameworks)
            ? structure.targetFrameworks
            : typeof structure.targetFrameworks === "string" && structure.targetFrameworks !== "[Circular]"
              ? [structure.targetFrameworks]
              : [];

          return (
            <div className="p-3.5 sm:px-4 rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] shadow-xs space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-md bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] text-xs font-bold flex items-center justify-center shrink-0">
                    <Layers className="w-3.5 h-3.5" />
                  </span>
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-semibold text-[color:var(--text-primary)]">
                      Target Theoretical Frameworks &amp; Models
                    </h4>
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-[color:var(--surface-inset)] text-[color:var(--text-secondary)]">
                      {frameworksList.length} active
                    </span>
                  </div>
                </div>
              </div>

              {/* Frameworks Chip List */}
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                {frameworksList.map((framework, fIdx) => (
                  <span
                    key={fIdx}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-[color:var(--surface-inset)] border border-[color:var(--border-subtle)] text-[color:var(--text-primary)] group/chip"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                    <span>{framework}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveFramework(fIdx)}
                      className="p-0.5 text-[color:var(--text-muted)] hover:text-rose-500 transition-colors cursor-pointer"
                      title={`Remove ${framework}`}
                      aria-label={`Remove framework ${framework}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}

                {/* Inline input to add framework */}
                <input
                  type="text"
                  value={newFramework}
                  onChange={(e) => setNewFramework(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newFramework.trim()) {
                      e.preventDefault();
                      handleAddFramework(newFramework);
                    }
                  }}
                  placeholder="+ Add framework or model (Press Enter)..."
                  className="text-xs px-2.5 py-1 rounded-lg bg-[color:var(--surface-inset)]/80 border border-dashed border-[color:var(--border-default)] text-[color:var(--text-primary)] placeholder-neutral-400 focus:outline-none focus:border-neutral-500 focus:bg-white dark:focus:bg-ink-500 transition-colors min-w-[200px]"
                  aria-label="Add theoretical framework"
                />
              </div>
            </div>
          );
        })()}
    </>
  );
}
