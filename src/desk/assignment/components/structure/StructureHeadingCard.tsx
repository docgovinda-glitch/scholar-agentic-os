import {
Plus,
Trash2,ArrowUp,
ArrowDown,StickyNote,
X,
Edit2,
BookOpen,BookmarkCheck
} from "lucide-react";
import type {
AssignmentStructure
} from "../../types";
import { removeKeyPoint } from "../../services/outlineEditing";
import { updateKeyPoint } from "../../services/outlineEditing";
import { addKeyPoint } from "../../services/outlineEditing";
import { updateSubheadingNotes } from "../../services/outlineEditing";
import { updateSubheadingTitle } from "../../services/outlineEditing";
import { updateMainHeadingTitle } from "../../services/outlineEditing";

export interface StructureHeadingCardProps {
  expandedBlueprintHeadings: { [x: string]: boolean; };
  expandedBlueprintSubheadings: { [x: string]: boolean; };
  expandedNotes: { [x: string]: boolean; };
  hIdx: number;
  handleAdjustHeadingWords: (headingId: string, delta: number) => void;
  handleAdjustWords: (subheadingId: string, delta: number) => void;
  handleCreateSubheading: (headingId: string) => void;
  handleDeleteHeading: (headingId: string) => void;
  handleDeleteSubheading: (subheadingId: string) => void;
  handleExactHeadingWords: (headingId: string, words: number) => void;
  handleExactWords: (subheadingId: string, words: number) => void;
  handleMoveHeading: (fromIdx: number, toIdx: number) => void;
  handleMoveSubheading: (headingId: string, fromIdx: number, toIdx: number) => void;
  heading: import("/home/user/scholar-agentic-os/src/desk/assignment/types").AssignmentMainHeading;
  headingPercentage: number;
  notifyChange: (updated: AssignmentStructure) => void;
  structure: AssignmentStructure;
  targetWordCount: number;
  toggleHeadingBlueprint: (headingId: string) => void;
  toggleNotes: (id: string) => void;
  toggleSubheadingBlueprint: (subId: string) => void;
}

export function StructureHeadingCard({ expandedBlueprintHeadings, expandedBlueprintSubheadings, expandedNotes, hIdx, handleAdjustHeadingWords, handleAdjustWords, handleCreateSubheading, handleDeleteHeading, handleDeleteSubheading, handleExactHeadingWords, handleExactWords, handleMoveHeading, handleMoveSubheading, heading, headingPercentage, notifyChange, structure, targetWordCount, toggleHeadingBlueprint, toggleNotes, toggleSubheadingBlueprint }: StructureHeadingCardProps) {
  return (
    <>
                    <div
                      className="rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] shadow-xs overflow-hidden transition-all group/heading"
                    >
                {/* Main Heading Header */}
                <div className="p-3.5 sm:p-4 bg-[color:var(--surface-inset)]/70 border-b border-[color:var(--border-subtle)] space-y-3">
                  {/* Row 1: Section Number & Full-Width Title (Zero Truncation) */}
                  <div className="flex items-center gap-2.5 w-full">
                    <span className="w-6 h-6 rounded-md bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] text-xs font-bold flex items-center justify-center shrink-0 shadow-2xs">
                      {heading.number}
                    </span>
                    <span className="sr-only">{heading.title}</span>
                    <div className="relative flex-1 min-w-0 flex items-center">
                      <input
                        type="text"
                        value={heading.title}
                        onChange={(e) => {
                          const updated = updateMainHeadingTitle(structure, heading.id, e.target.value);
                          notifyChange(updated);
                        }}
                        placeholder="Main Heading Title"
                        aria-label={`Heading ${heading.number}: ${heading.title}`}
                        className="text-xs sm:text-sm font-semibold text-[color:var(--text-primary)] bg-transparent border-b border-transparent hover:border-neutral-300 dark:hover:border-white/20 focus:border-neutral-500 focus:outline-none py-1 w-full pr-6"
                      />
                      <Edit2 className="w-3 h-3 text-[color:var(--text-muted)] absolute right-1 pointer-events-none opacity-40 group-hover/heading:opacity-100 transition-opacity" />
                    </div>
                  </div>

                  {/* Row 2: Word Budget & Actions Cluster */}
                  <div className="flex items-center justify-between gap-3 flex-wrap pt-0.5 text-xs">
                    {/* Left: Word count stepper & percentage */}
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-lg p-0.5 shadow-2xs">
                        <button
                          type="button"
                          onClick={() => handleAdjustHeadingWords(heading.id, -50)}
                          className="px-1.5 py-0.5 text-xs font-mono font-semibold rounded hover:bg-[color:var(--surface-hover)] text-[color:var(--text-secondary)] transition-colors cursor-pointer"
                          title="Decrease section word budget by 50 words"
                          aria-label={`Decrease section ${heading.number} word count by 50`}
                        >
                          -50
                        </button>
                        <div className="relative flex items-center">
                          <input
                            type="number"
                            min={0}
                            step={25}
                            value={heading.targetWordCount || ""}
                            onChange={(e) =>
                              handleExactHeadingWords(heading.id, parseInt(e.target.value, 10) || 0)
                            }
                            aria-label={`Word count for section ${heading.title}`}
                            className="w-14 bg-transparent text-right text-xs font-semibold text-[color:var(--text-primary)] focus:outline-none pr-4 tabular-nums"
                          />
                          <span className="pointer-events-none absolute right-1 text-xs text-[color:var(--text-muted)]">
                            w
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleAdjustHeadingWords(heading.id, 50)}
                          className="px-1.5 py-0.5 text-xs font-mono font-semibold rounded hover:bg-[color:var(--surface-hover)] text-[color:var(--text-secondary)] transition-colors cursor-pointer"
                          title="Increase section word budget by 50 words"
                          aria-label={`Increase section ${heading.number} word count by 50`}
                        >
                          +50
                        </button>
                      </div>

                      <span className="text-xs font-semibold text-[color:var(--text-secondary)] tabular-nums">
                        {heading.targetWordCount.toLocaleString()} words
                      </span>
                      <span className="text-xs font-mono text-[color:var(--text-muted)] tabular-nums">
                        (~{headingPercentage}%)
                      </span>
                    </div>

                    {/* Right: Actions cluster */}
                    <div className="flex items-center gap-1.5">
                      {/* Reorder Buttons */}
                      <div className="flex items-center gap-0.5 text-[color:var(--text-muted)]">
                        <button
                          type="button"
                          onClick={() => handleMoveHeading(hIdx, hIdx - 1)}
                          disabled={hIdx === 0}
                          title="Move heading up"
                          className="p-1 rounded hover:text-neutral-700 dark:hover:text-white hover:bg-[color:var(--surface-hover)] disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed"
                        >
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveHeading(hIdx, hIdx + 1)}
                          disabled={hIdx === structure.headings.length - 1}
                          title="Move heading down"
                          className="p-1 rounded hover:text-neutral-700 dark:hover:text-white hover:bg-[color:var(--surface-hover)] disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed"
                        >
                          <ArrowDown className="w-3 h-3" />
                        </button>
                      </div>

                      {/* Research Basis Toggle */}
                      <button
                        type="button"
                        onClick={() => toggleHeadingBlueprint(heading.id)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                          expandedBlueprintHeadings[heading.id]
                            ? "bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] shadow-2xs"
                            : "bg-[color:var(--surface-inset)] hover:bg-[color:var(--surface-hover)] text-[color:var(--text-secondary)] border border-[color:var(--border-subtle)]"
                        }`}
                        title="View research basis and supporting scholarly sources"
                        aria-label={`Research basis for section ${heading.number}`}
                      >
                        <BookOpen className="w-3 h-3 text-indigo-500 dark:text-indigo-400" />
                        <span>Research basis</span>
                        {(heading.scholarlySources || []).length > 0 && (
                          <span className="text-xs opacity-75 font-mono">
                            · {heading.scholarlySources?.length}
                          </span>
                        )}
                      </button>

                      {/* Add Subheading Button */}
                      <button
                        type="button"
                        onClick={() => handleCreateSubheading(heading.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-[color:var(--surface-sunken)]/70 hover:bg-neutral-300 dark:hover:bg-white/15 text-[color:var(--text-secondary)] transition-colors cursor-pointer"
                        title="Add a subheading to this section"
                        aria-label={`Add subheading to section ${heading.number}`}
                      >
                        <Plus className="w-3 h-3" />
                        <span>Subheading</span>
                      </button>

                      {/* Delete Heading */}
                      {structure.headings.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleDeleteHeading(heading.id)}
                          className="p-1 text-[color:var(--text-muted)] hover:text-rose-500 hover:bg-rose-500/10 rounded transition-colors cursor-pointer"
                          title="Delete main heading"
                          aria-label={`Delete heading ${heading.title}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Main Heading Research Basis Drawer */}
                {expandedBlueprintHeadings[heading.id] && (
                  <div className="p-3.5 sm:p-4 bg-[color:var(--surface-inset)]/70 border-b border-[color:var(--border-subtle)] space-y-3 animate-in fade-in duration-150">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[color:var(--text-primary)] flex items-center gap-1.5">
                        <BookOpen className="w-3.5 h-3.5 text-indigo-500" />
                        <span>Section {heading.number} Research Basis</span>
                      </span>
                      {heading.assignmentQuestionAddressed && (
                        <span className="px-2 py-0.5 rounded text-xs text-[color:var(--text-secondary)] bg-[color:var(--surface-sunken)]/50 truncate max-w-sm">
                          Directly answers: {heading.assignmentQuestionAddressed}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {heading.purpose && (
                        <div className="p-2.5 rounded-lg bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] space-y-0.5">
                          <strong className="text-xs uppercase text-[color:var(--text-muted)] font-bold block">Purpose &amp; Objective</strong>
                          <p className="text-xs text-[color:var(--text-primary)]">{heading.purpose}</p>
                        </div>
                      )}
                      {heading.evidenceRequired && (
                        <div className="p-2.5 rounded-lg bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] space-y-0.5">
                          <strong className="text-xs uppercase text-[color:var(--text-muted)] font-bold block">Empirical Evidence Required</strong>
                          <p className="text-xs text-[color:var(--text-primary)]">{heading.evidenceRequired}</p>
                        </div>
                      )}
                      {heading.counterarguments && heading.counterarguments.length > 0 && (
                        <div className="p-2.5 rounded-lg bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] space-y-0.5">
                          <strong className="text-xs uppercase text-[color:var(--text-muted)] font-bold block">Competing Perspectives &amp; Debates</strong>
                          <p className="text-xs text-[color:var(--text-primary)]">{heading.counterarguments.join(" | ")}</p>
                        </div>
                      )}
                      {heading.expectedContribution && (
                        <div className="p-2.5 rounded-lg bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] space-y-0.5">
                          <strong className="text-xs uppercase text-[color:var(--text-muted)] font-bold block">Contribution to Thesis</strong>
                          <p className="text-xs text-[color:var(--text-primary)]">{heading.expectedContribution}</p>
                        </div>
                      )}
                    </div>

                    {/* Scholarly Sources */}
                    {heading.scholarlySources && heading.scholarlySources.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        <span className="text-xs uppercase font-bold text-[color:var(--text-muted)] tracking-wider flex items-center gap-1">
                          <BookmarkCheck className="w-3 h-3 text-indigo-500" />
                          <span>Supporting Scholarly Sources ({heading.scholarlySources.length})</span>
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {heading.scholarlySources.map((src, sIdx) => (
                            <div
                              key={sIdx}
                              className="p-2 rounded-lg bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] shadow-2xs space-y-1"
                            >
                              <div className="flex items-start justify-between gap-1.5">
                                <span className="text-xs font-semibold text-[color:var(--text-primary)] line-clamp-1">
                                  {src.title}
                                </span>
                                {src.role && (
                                  <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-[color:var(--surface-inset)] text-[color:var(--text-secondary)] shrink-0">
                                    {src.role}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-[color:var(--text-muted)]">
                                {src.authors?.slice(0, 2).join(", ")} ({src.year || "n.d."}){src.journalOrPublisher ? ` • ${src.journalOrPublisher}` : ""}
                              </p>
                              {src.relevance && (
                                <p className="text-xs text-[color:var(--text-secondary)] italic line-clamp-2">
                                  "{src.relevance}"
                                </p>
                              )}
                              <span className="text-xs font-mono text-[color:var(--text-muted)] block pt-0.5">
                                Citation: {src.citation}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Subheadings Container */}
                <div className="p-3 sm:p-4 space-y-2.5">
                  {heading.subheadings.length === 0 ? (
                    <div className="py-4 px-3 text-center rounded-lg border border-dashed border-[color:var(--border-subtle)] bg-[color:var(--surface-inset)]/50">
                      <p className="text-xs text-[color:var(--text-muted)] mb-2">
                        No subheadings in this section yet.
                      </p>
                      <button
                        type="button"
                        onClick={() => handleCreateSubheading(heading.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] hover:opacity-90 transition-opacity cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Subheading</span>
                      </button>
                    </div>
                  ) : (
                    heading.subheadings.map((sub, sIdx) => {
                      const subPercent =
                        targetWordCount > 0
                          ? Math.round((sub.targetWordCount / targetWordCount) * 100)
                          : 0;
                      const isNotesOpen = expandedNotes[sub.id];

                      return (
                        <div
                          key={sub.id}
                          className="p-2.5 sm:p-3 rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--surface-inset)]/70 hover:border-neutral-300 dark:hover:border-white/15 transition-all space-y-2 group/sub"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                            {/* Subheading Title & Number */}
                            <div className="flex-1 min-w-0 flex items-center gap-2">
                              <span className="text-xs font-mono font-bold text-[color:var(--text-muted)] shrink-0 w-7">
                                {sub.numberStr}
                              </span>
                              <span className="sr-only">{sub.title}</span>
                              <div className="relative flex-1 min-w-0 flex items-center">
                                <input
                                  type="text"
                                  value={sub.title}
                                  onChange={(e) => {
                                    const updated = updateSubheadingTitle(structure, sub.id, e.target.value);
                                    notifyChange(updated);
                                  }}
                                  placeholder="Subheading Title"
                                  aria-label={`Subheading ${sub.numberStr}: ${sub.title}`}
                                  className="text-xs font-medium text-[color:var(--text-primary)] bg-transparent border-b border-transparent hover:border-neutral-300 dark:hover:border-white/20 focus:border-neutral-500 focus:outline-none py-0.5 truncate w-full pr-5"
                                />
                                <Edit2 className="w-2.5 h-2.5 text-[color:var(--text-muted)] absolute right-1 pointer-events-none opacity-30 group-hover/sub:opacity-100 transition-opacity" />
                              </div>
                            </div>

                            {/* Word Count Adjustment Controls */}
                            <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                              <span className="text-xs font-mono text-[color:var(--text-muted)] tabular-nums hidden md:inline mr-1">
                                ~{subPercent}%
                              </span>

                              {/* -50 Words */}
                              <button
                                type="button"
                                onClick={() => handleAdjustWords(sub.id, -50)}
                                className="px-1.5 py-1 text-xs font-mono font-semibold rounded bg-[color:var(--surface-sunken)]/60 hover:bg-neutral-300 dark:hover:bg-white/15 text-[color:var(--text-secondary)] transition-colors cursor-pointer"
                                title="Decrease by 50 words"
                                aria-label="-50"
                              >
                                -50
                              </button>

                              {/* Direct Word Input */}
                              <div className="relative flex items-center">
                                <input
                                  type="number"
                                  min={0}
                                  step={25}
                                  value={sub.targetWordCount || ""}
                                  onChange={(e) =>
                                    handleExactWords(sub.id, parseInt(e.target.value, 10) || 0)
                                  }
                                  aria-label={`Word count for ${sub.title}`}
                                  className="w-20 bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-md px-2 py-1 text-right text-xs font-semibold text-[color:var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-white pr-6 tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                                <span className="pointer-events-none absolute right-1.5 text-xs text-[color:var(--text-muted)]">
                                  w
                                </span>
                              </div>

                              {/* +50 Words */}
                              <button
                                type="button"
                                onClick={() => handleAdjustWords(sub.id, 50)}
                                className="px-1.5 py-1 text-xs font-mono font-semibold rounded bg-[color:var(--surface-sunken)]/60 hover:bg-neutral-300 dark:hover:bg-white/15 text-[color:var(--text-secondary)] transition-colors cursor-pointer"
                                title="Increase by 50 words"
                                aria-label="+50"
                              >
                                +50
                              </button>

                              {/* Reorder Subheading Buttons */}
                              <div className="flex items-center text-[color:var(--text-muted)] pl-1">
                                <button
                                  type="button"
                                  onClick={() => handleMoveSubheading(heading.id, sIdx, sIdx - 1)}
                                  disabled={sIdx === 0}
                                  title="Move subheading up"
                                  className="p-1 rounded hover:text-neutral-700 dark:hover:text-white hover:bg-[color:var(--surface-hover)] disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed"
                                >
                                  <ArrowUp className="w-2.5 h-2.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleMoveSubheading(heading.id, sIdx, sIdx + 1)}
                                  disabled={sIdx === heading.subheadings.length - 1}
                                  title="Move subheading down"
                                  className="p-1 rounded hover:text-neutral-700 dark:hover:text-white hover:bg-[color:var(--surface-hover)] disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed"
                                >
                                  <ArrowDown className="w-2.5 h-2.5" />
                                </button>
                              </div>

                              {/* Research Basis toggle button */}
                              <button
                                type="button"
                                onClick={() => toggleSubheadingBlueprint(sub.id)}
                                className={`p-1 rounded text-xs transition-colors cursor-pointer ml-0.5 ${
                                  expandedBlueprintSubheadings[sub.id]
                                    ? "text-indigo-600 dark:text-indigo-400 bg-indigo-500/10"
                                    : "text-[color:var(--text-muted)] hover:text-indigo-600 dark:hover:text-indigo-400"
                                }`}
                                title="Research basis & supporting sources"
                                aria-label="Toggle Subheading Research Basis"
                              >
                                <BookOpen className="w-3.5 h-3.5" />
                              </button>

                              {/* Notes toggle button */}
                              <button
                                type="button"
                                onClick={() => toggleNotes(sub.id)}
                                className={`p-1 rounded text-xs transition-colors cursor-pointer ml-0.5 ${
                                  sub.notes || isNotesOpen
                                    ? "text-blue-600 dark:text-blue-400 bg-blue-500/10"
                                    : "text-[color:var(--text-muted)] hover:text-neutral-700 dark:hover:text-neutral-200"
                                }`}
                                title={sub.notes ? "Edit section notes" : "Add section notes"}
                              >
                                <StickyNote className="w-3.5 h-3.5" />
                              </button>

                              {/* Delete Subheading */}
                              <button
                                type="button"
                                onClick={() => handleDeleteSubheading(sub.id)}
                                disabled={heading.subheadings.length <= 1}
                                className="p-1 text-[color:var(--text-muted)] hover:text-rose-500 hover:bg-rose-500/10 rounded transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-neutral-400"
                                title={heading.subheadings.length <= 1 ? "A section needs at least one part; delete the section instead" : "Delete subheading"}
                                aria-label={`Delete subheading ${sub.title}`}
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>

                        {/* Focus Arguments & Evidence */}
                        <div className="pt-2 border-t border-[color:var(--border-subtle)] space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-[color:var(--text-secondary)] flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                              <span>Focus Arguments &amp; Evidence ({(sub.keyPoints || []).length})</span>
                            </span>
                          </div>

                          {sub.keyPoints && sub.keyPoints.length > 0 && (
                            <div className="space-y-1 pl-2 border-l-2 border-blue-500/20">
                              {sub.keyPoints.map((point, pIdx) => (
                                <div key={pIdx} className="flex items-center gap-2 group/h3">
                                  <span className="text-xs text-[color:var(--text-muted)] font-mono shrink-0">
                                    {sub.numberStr}.{pIdx + 1}
                                  </span>
                                  <input
                                    type="text"
                                    value={point}
                                    onChange={(e) => {
                                      const updated = updateKeyPoint(structure, sub.id, pIdx, e.target.value);
                                      notifyChange(updated);
                                    }}
                                    placeholder="Focus argument or evidence point..."
                                    className="flex-1 text-xs py-0.5 px-1.5 rounded bg-transparent border border-transparent hover:border-neutral-200 dark:hover:border-white/10 focus:border-neutral-400 dark:focus:border-white/20 focus:bg-white dark:focus:bg-ink-500 text-[color:var(--text-primary)] transition-colors"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated = removeKeyPoint(structure, sub.id, pIdx);
                                      notifyChange(updated);
                                    }}
                                    className="opacity-0 group-hover/h3:opacity-100 p-0.5 text-[color:var(--text-muted)] hover:text-rose-500 transition-opacity cursor-pointer"
                                    title="Remove focus point"
                                    aria-label={`Remove focus point ${point}`}
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Add focus point input */}
                          <div className="flex items-center gap-1.5 pl-2 pt-0.5">
                            <input
                              type="text"
                              placeholder="+ Add argument or evidence point (Press Enter)..."
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && e.currentTarget.value.trim()) {
                                  const updated = addKeyPoint(structure, sub.id, e.currentTarget.value.trim());
                                  notifyChange(updated);
                                  e.currentTarget.value = "";
                                }
                              }}
                              className="text-xs py-1 px-2.5 rounded-md bg-white/70 dark:bg-white/5 border border-dashed border-[color:var(--border-default)] text-[color:var(--text-primary)] placeholder-neutral-400 focus:outline-none focus:border-blue-500 w-full"
                            />
                          </div>
                        </div>

                        {/* Collapsible / Editable Notes & Guidance Box */}
                        {(isNotesOpen || sub.notes) && (
                          <div className="pt-2 border-t border-[color:var(--border-subtle)] space-y-1.5 animate-in fade-in duration-100">
                            <label className="text-xs uppercase font-semibold text-[color:var(--text-muted)] tracking-wider flex items-center justify-between">
                              <span>Drafting Notes</span>
                            </label>
                            <input
                              type="text"
                              value={sub.notes || ""}
                              onChange={(e) => {
                                const updated = updateSubheadingNotes(structure, sub.id, e.target.value);
                                notifyChange(updated);
                              }}
                              placeholder="e.g. Focus on empirical evidence from 2022-2025..."
                              className="w-full text-xs p-2 rounded-lg bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] text-[color:var(--text-primary)] placeholder-neutral-400 focus:outline-none focus:border-neutral-400 dark:focus:border-white/20"
                            />
                            {sub.guidance && (
                              <p className="text-xs text-[color:var(--text-muted)] italic">
                                Scope: {sub.guidance}
                              </p>
                            )}
                          </div>
                        )}

                        {/* Subheading Research Basis Panel */}
                        {expandedBlueprintSubheadings[sub.id] && (
                          <div className="pt-2 border-t border-indigo-500/20 dark:border-indigo-500/10 space-y-2 animate-in fade-in duration-100 bg-indigo-500/[0.02] p-2.5 rounded-lg">
                            <div className="flex items-center justify-between">
                              <span className="text-xs uppercase font-bold text-indigo-600 dark:text-indigo-400 tracking-wider flex items-center gap-1">
                                <BookOpen className="w-3 h-3" />
                                <span>{sub.numberStr} Research Basis</span>
                              </span>
                              {sub.assignmentQuestionAddressed && (
                                <span className="text-xs text-[color:var(--text-muted)] truncate max-w-xs">
                                  Addresses: {sub.assignmentQuestionAddressed}
                                </span>
                              )}
                            </div>

                            {sub.purpose && (
                              <p className="text-xs text-[color:var(--text-secondary)]">
                                <strong>Analytical Focus: </strong>{sub.purpose}
                              </p>
                            )}

                            {sub.evidenceRequired && (
                              <p className="text-xs text-[color:var(--text-secondary)]">
                                <strong>Evidence Required: </strong>{sub.evidenceRequired}
                              </p>
                            )}

                            {sub.scholarlySources && sub.scholarlySources.length > 0 && (
                              <div className="space-y-1 pt-1">
                                <span className="text-xs font-semibold text-[color:var(--text-muted)] uppercase tracking-wider block">
                                  Supporting Scholarly Sources:
                                </span>
                                <div className="space-y-1">
                                  {sub.scholarlySources.map((src, sIdx) => (
                                    <div
                                      key={sIdx}
                                      className="p-1.5 rounded bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] text-xs flex items-center justify-between gap-2"
                                    >
                                      <div className="truncate">
                                        <strong className="text-[color:var(--text-primary)]">{src.citation}</strong>
                                        <span className="text-[color:var(--text-muted)] ml-1.5 truncate">"{src.title}"</span>
                                      </div>
                                      {src.role && (
                                        <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shrink-0">
                                          {src.role}
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  }))}
                </div>
                    </div>
    </>
  );
}
