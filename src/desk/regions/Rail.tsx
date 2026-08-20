import { useEffect, useState } from "react";
import { getOutputTypeSpec } from "../api";
import type { CanonicalDocument, SectionSpec } from "../types";
import ProjectFilesPanel from "./ProjectFilesPanel";
import ProjectVaultPanel from "./ProjectVaultPanel";
import ProjectSourcesPanel from "./ProjectSourcesPanel";

const HEADING_KINDS = new Set(["heading1", "heading2", "heading3"]);

type RailTab = "outline" | "sources" | "vault" | "files";
const TABS: { id: RailTab; label: string }[] = [
  { id: "outline", label: "Outline" },
  { id: "sources", label: "Sources" },
  { id: "vault", label: "Vault" },
  { id: "files", label: "Files" },
];

/** Region B (docs 22 §2/§3). Outline is real once a document exists — derived
 * from the document's heading blocks, per docs 20 §5.2 ("Organised by the
 * Structure tree"). Before that, it shows the output type's own planned
 * structure from Atlas (structure.sections) instead of a flat "no document
 * yet" — this is what actually makes the sidebar depend on which document
 * type the project is bound to: a doctoral dissertation's chapters, a
 * journal article's Abstract/Introduction/Methods/Results/Discussion, an
 * essay's much shorter shape. Sources/Vault/Files have no backing data yet
 * (app/vault content-search integration, app/ingestion — not started, 13
 * §8.3 — the Vault destination itself does exist now, reached from Header,
 * but nothing here searches it from inside a project) and are shown as
 * honest not-built states rather than omitted, so the shell's shape matches
 * the spec even where the data behind a panel doesn't exist yet. */
export default function Rail({
  projectId,
  document,
  outputTypeId,
  onJumpToBlock,
}: {
  projectId: string;
  document: CanonicalDocument | null;
  outputTypeId: string;
  onJumpToBlock: (blockId: string) => void;
}) {
  const [tab, setTab] = useState<RailTab>("outline");
  const [plannedSections, setPlannedSections] = useState<SectionSpec[] | null>(null);
  const headings = document?.blocks.filter((b) => HEADING_KINDS.has(b.kind)) ?? [];

  useEffect(() => {
    let active = true;
    setPlannedSections(null);
    getOutputTypeSpec(outputTypeId)
      .then((spec) => active && setPlannedSections(spec.structure.sections))
      .catch(() => active && setPlannedSections([]));
    return () => {
      active = false;
    };
  }, [outputTypeId]);

  return (
    <nav className="flex flex-col w-56 shrink-0 border-r border-[color:var(--color-border-subtle)] bg-[color:var(--color-navy-1)] text-sm" aria-label="Project navigation">
      <div className="flex border-b border-[color:var(--color-border-subtle)]">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? "true" : undefined}
            className={`flex-1 px-2 py-2 text-xs ${ tab === t.id ? "text-[color:var(--color-luminous-blue)] border-b-2 border-[color:var(--color-luminous-blue)]" : "text-[color:var(--text-muted)] hover:text-[color:var(--text-secondary)]" }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {tab === "outline" ? (
          headings.length > 0 ? (
            <ul className="flex flex-col gap-0.5" aria-label="Document outline">
              {headings.map((h) => (
                <li key={h.id}>
                  <button
                    onClick={() => onJumpToBlock(h.id)}
                    className={`w-full text-left px-2 py-1 rounded text-[color:var(--text-secondary)] hover:bg-[color:var(--color-navy-2)] truncate ${
                      h.kind === "heading1" ? "font-semibold" : h.kind === "heading2" ? "pl-4" : "pl-6 text-xs"
                    }`}
                    title={h.text}
                  >
                    {h.text || "(untitled)"}
                  </button>
                </li>
              ))}
            </ul>
          ) : plannedSections === null ? (
            <p className="text-xs text-[color:var(--text-muted)] p-2">Loading the structure for this document type…</p>
          ) : plannedSections.length === 0 ? (
            <p className="text-xs text-[color:var(--text-muted)] p-2">No document submitted yet.</p>
          ) : (
            <>
              <p className="text-xs text-[color:var(--text-muted)] px-2 pb-1.5">
                What a {document ? "document" : "finished draft"} of this type is expected to contain:
              </p>
              <PlannedStructureList sections={plannedSections} />
            </>
          )
        ) : tab === "sources" ? (
          <ProjectSourcesPanel />
        ) : tab === "files" ? (
          <ProjectFilesPanel projectId={projectId} />
        ) : tab === "vault" ? (
          <ProjectVaultPanel projectId={projectId} onJumpToBlock={onJumpToBlock} />
        ) : null}
      </div>
    </nav>
  );
}

/** Recursive: chapter_based types (e.g. a doctoral dissertation) nest sections inside chapters via SectionSpec.children. */
function PlannedStructureList({ sections, depth = 0 }: { sections: SectionSpec[]; depth?: number }) {
  return (
    <ul className={depth === 0 ? "flex flex-col gap-0.5" : "flex flex-col gap-0.5 mt-0.5"}>
      {sections.map((s) => (
        <li key={s.key}>
          <div
            title={s.guidance}
            className={`px-2 py-1 truncate text-[color:var(--text-secondary)] ${depth > 0 ? "pl-4 text-xs" : ""}`}
          >
            {s.title}
            {!s.required && <span className="ml-1.5 text-[10px] text-[color:var(--text-muted)]">optional</span>}
          </div>
          {s.children && s.children.length > 0 && <PlannedStructureList sections={s.children} depth={depth + 1} />}
        </li>
      ))}
    </ul>
  );
}
