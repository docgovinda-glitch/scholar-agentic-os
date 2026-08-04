import { useState } from "react";
import type { CanonicalDocument } from "../types";

const HEADING_KINDS = new Set(["heading1", "heading2", "heading3"]);

type RailTab = "outline" | "sources" | "vault" | "files";
const TABS: { id: RailTab; label: string }[] = [
  { id: "outline", label: "Outline" },
  { id: "sources", label: "Sources" },
  { id: "vault", label: "Vault" },
  { id: "files", label: "Files" },
];

/** Region B (docs 22 §2/§3). Outline is real — derived from the document's
 * heading blocks, per docs 20 §5.2 ("Organised by the Structure tree").
 * Sources/Vault/Files have no backing data yet (app/vault, app/ingestion —
 * not started, 13 §8.3) and are shown as honest not-built states rather
 * than omitted, so the shell's shape matches the spec even where the data
 * behind a panel doesn't exist yet. */
export default function Rail({ document, onJumpToBlock }: { document: CanonicalDocument | null; onJumpToBlock: (blockId: string) => void }) {
  const [tab, setTab] = useState<RailTab>("outline");
  const headings = document?.blocks.filter((b) => HEADING_KINDS.has(b.kind)) ?? [];

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
          headings.length === 0 ? (
            <p className="text-xs text-[color:var(--text-muted)] p-2">
              {document ? "No headings in this document yet." : "No document submitted yet."}
            </p>
          ) : (
            <ul className="flex flex-col gap-0.5">
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
          )
        ) : (
          <p className="text-xs text-[color:var(--text-muted)] p-2">
            Not yet built — {TABS.find((t) => t.id === tab)?.label} needs {tab === "sources" ? "the Corpus API" : tab === "vault" ? "app/vault" : "project file attachments"}, none of which exist yet.
          </p>
        )}
      </div>
    </nav>
  );
}
