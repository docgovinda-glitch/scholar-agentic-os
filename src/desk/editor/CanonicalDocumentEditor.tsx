import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { BlockId } from "./blockIdExtension";
import { documentToTiptap, tiptapToDocument } from "./cdmTiptap";
import type { CanonicalDocument } from "../types";

/**
 * The real manuscript editor (docs 22 §12's "custom document model over a
 * proven text engine"), replacing Primary.tsx's former read-only block
 * viewer. See cdmTiptap.ts's module comment for the deliberate scope limit
 * (structural editing only, no inline marks) and why that keeps saves
 * lossless rather than silently dropping formatting the CDM can't hold yet.
 *
 * Uncontrolled by design: `document` seeds the editor's initial content and
 * is only re-applied when `document.id` changes (a different project's
 * document loaded) — re-syncing on every parent re-render would fight the
 * user's own typing by resetting ProseMirror's live state out from under
 * them mid-keystroke.
 */
export default function CanonicalDocumentEditor({
  document,
  onSave,
  saving,
}: {
  document: CanonicalDocument;
  onSave: (next: CanonicalDocument) => void;
  saving: boolean;
}) {
  const [dirty, setDirty] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        bold: false,
        italic: false,
        strike: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        orderedList: false,
      }),
      BlockId,
      Placeholder.configure({ placeholder: "Start writing…" }),
    ],
    content: documentToTiptap(document),
    onUpdate: () => setDirty(true),
    editorProps: {
      attributes: { class: "tiptap-editor" },
    },
  });

  const lastDocId = useRef(document.id);
  useEffect(() => {
    if (editor && document.id !== lastDocId.current) {
      editor.commands.setContent(documentToTiptap(document));
      lastDocId.current = document.id;
      setDirty(false);
    }
  }, [editor, document]);

  function handleSave() {
    if (!editor) return;
    const next = tiptapToDocument(editor.getJSON(), { id: document.id, title: document.title, metadata: document.metadata });
    onSave(next);
    setDirty(false);
  }

  if (!editor) return null;

  return (
    <div className="flex flex-col gap-2">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !dirty}
          className="self-start rounded-[var(--radius-md)] bg-[color:var(--accent-solid)] px-3.5 py-2 text-sm font-medium text-[color:var(--text-inverse)] transition-colors duration-[var(--motion-fast)] hover:bg-[color:var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-55 cursor-pointer"
        >
          {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
        </button>
      </div>
    </div>
  );
}

function ToolbarButton({
  onClick,
  active,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      disabled={disabled}
      className={[
        "rounded px-2 py-1 text-xs font-medium transition-colors duration-[var(--motion-fast)] cursor-pointer disabled:cursor-not-allowed disabled:opacity-40",
        active
          ? "bg-[color:var(--accent-subtle)] text-[color:var(--accent)]"
          : "text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-[color:var(--border-subtle)] pb-2">
      <ToolbarButton label="Paragraph" active={editor.isActive("paragraph")} onClick={() => editor.chain().focus().setParagraph().run()}>
        P
      </ToolbarButton>
      <ToolbarButton label="Heading 1" active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
        H1
      </ToolbarButton>
      <ToolbarButton label="Heading 2" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        H2
      </ToolbarButton>
      <ToolbarButton label="Heading 3" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
        H3
      </ToolbarButton>
      <ToolbarButton label="Quote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        Quote
      </ToolbarButton>
      <ToolbarButton label="Bullet list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        List
      </ToolbarButton>
      <span className="mx-1 h-4 w-px bg-[color:var(--border-subtle)]" />
      <ToolbarButton label="Undo" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}>
        Undo
      </ToolbarButton>
      <ToolbarButton label="Redo" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}>
        Redo
      </ToolbarButton>
    </div>
  );
}
