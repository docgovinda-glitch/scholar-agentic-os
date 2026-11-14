import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { Node, mergeAttributes } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { TableKit } from "@tiptap/extension-table";
import TextAlign from "@tiptap/extension-text-align";
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, Columns3, Heading4, Italic, List, ListOrdered, Quote, Redo2, Rows3, Table2, Trash2, Underline as UnderlineIcon, Undo2 } from "lucide-react";
import { docToText, normalizeSectionText, textToDoc, type PMNode } from "./sectionDoc";
import type React from "react";

/** What the Studio can do to the section being edited. */
export interface SectionEditorHandle {
  insertText: (text: string) => void;
  insertCitation: (id: string) => void;
  /** The selected part as stored text, or null when nothing is selected. */
  selectedText: () => string | null;
}

/** A citation sits in the text as one object; it is saved as [CITE:id]. */
function citationNode(label: (id: string) => string) {
  return Node.create({
    name: "citation",
    group: "inline",
    inline: true,
    atom: true,
    selectable: true,
    addAttributes() {
      return { id: { default: "" } };
    },
    parseHTML() {
      return [{ tag: "span[data-cite]", getAttrs: (el) => ({ id: (el as HTMLElement).getAttribute("data-cite") }) }];
    },
    renderHTML({ node, HTMLAttributes }) {
      const id = String(node.attrs.id ?? "");
      return [
        "span",
        mergeAttributes(HTMLAttributes, { "data-cite": id, class: "cite-chip", title: `Citation: ${id}` }),
        label(id),
      ];
    },
  });
}

const Button = ({ on, label, icon, onClick }: { on: boolean; label: string; icon: React.ReactNode; onClick: () => void }) => (
  <button
    type="button"
    aria-label={label}
    aria-pressed={on}
    title={label}
    onMouseDown={(e) => e.preventDefault()}
    onClick={onClick}
    className={`p-1.5 rounded-md cursor-pointer ${on ? "bg-[color:var(--surface-sunken)] text-[color:var(--text-primary)]" : "text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)]"}`}
  >
    {icon}
  </button>
);

function Toolbar({ editor, extra, richBlocks }: { editor: Editor; extra?: React.ReactNode; richBlocks?: boolean }) {
  return (
    <div role="toolbar" aria-label="Text formatting" className="flex flex-wrap items-center gap-0.5 px-2 py-1 border-b border-[color:var(--border-subtle)]">
      <Button on={false} label="Undo" icon={<Undo2 className="w-3.5 h-3.5" />} onClick={() => editor.chain().focus().undo().run()} />
      <Button on={false} label="Redo" icon={<Redo2 className="w-3.5 h-3.5" />} onClick={() => editor.chain().focus().redo().run()} />
      <span aria-hidden="true" className="mx-1 h-4 w-px bg-[color:var(--border-subtle)]" />
      <Button on={editor.isActive("bold")} label="Bold" icon={<Bold className="w-3.5 h-3.5" />} onClick={() => editor.chain().focus().toggleBold().run()} />
      <Button on={editor.isActive("italic")} label="Italic" icon={<Italic className="w-3.5 h-3.5" />} onClick={() => editor.chain().focus().toggleItalic().run()} />
      {richBlocks && (
        <Button on={editor.isActive("underline")} label="Underline" icon={<UnderlineIcon className="w-3.5 h-3.5" />} onClick={() => editor.chain().focus().toggleUnderline().run()} />
      )}
      <Button on={editor.isActive("heading", { level: 4 })} label="Sub-heading" icon={<Heading4 className="w-3.5 h-3.5" />} onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()} />
      <Button on={editor.isActive("bulletList")} label="Bulleted list" icon={<List className="w-3.5 h-3.5" />} onClick={() => editor.chain().focus().toggleBulletList().run()} />
      <Button on={editor.isActive("orderedList")} label="Numbered list" icon={<ListOrdered className="w-3.5 h-3.5" />} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
      {richBlocks && (
        <>
          <span aria-hidden="true" className="mx-1 h-4 w-px bg-[color:var(--border-subtle)]" />
          {(
            [
              ["left", "Align left", AlignLeft],
              ["center", "Align centre", AlignCenter],
              ["right", "Align right", AlignRight],
              ["justify", "Justify", AlignJustify],
            ] as const
          ).map(([value, label, Icon]) => (
            <Button
              key={value}
              on={value === "left" ? !["center", "right", "justify"].some((a) => editor.isActive({ textAlign: a })) : editor.isActive({ textAlign: value })}
              label={label}
              icon={<Icon className="w-3.5 h-3.5" />}
              onClick={() => editor.chain().focus().setTextAlign(value).run()}
            />
          ))}
          <span aria-hidden="true" className="mx-1 h-4 w-px bg-[color:var(--border-subtle)]" />
          <Button on={editor.isActive("blockquote")} label="Block quote" icon={<Quote className="w-3.5 h-3.5" />} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
          <Button
            on={false}
            label="Insert table"
            icon={<Table2 className="w-3.5 h-3.5" />}
            onClick={() => {
              // A table cannot be stored inside a block quote, so step out of one first.
              const chain = editor.chain().focus();
              (editor.isActive("blockquote") ? chain.lift("blockquote") : chain).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
            }}
          />
          {editor.isActive("table") && (
            <>
              <Button on={false} label="Add row" icon={<Rows3 className="w-3.5 h-3.5" />} onClick={() => editor.chain().focus().addRowAfter().run()} />
              <Button on={false} label="Add column" icon={<Columns3 className="w-3.5 h-3.5" />} onClick={() => editor.chain().focus().addColumnAfter().run()} />
              <Button on={false} label="Delete table" icon={<Trash2 className="w-3.5 h-3.5" />} onClick={() => editor.chain().focus().deleteTable().run()} />
            </>
          )}
        </>
      )}
      {extra ? <div className="ml-auto flex items-center gap-1">{extra}</div> : null}
    </div>
  );
}

/**
 * The text of one section as a document: paragraphs, sub-headings, lists,
 * bold and italic, and citations as objects. It reads and writes the same
 * stored text as before, so nothing downstream changes.
 */
const SectionTextEditor = forwardRef<SectionEditorHandle, {
  value: string;
  onChange: (next: string) => void;
  ariaLabel: string;
  placeholder?: string;
  citationLabel: (id: string) => string;
  /** Workspace-specific controls shown at the right of the toolbar (e.g. Insert citation). */
  toolbarExtra?: React.ReactNode;
  /** Extra classes for the editable area (size, typography). */
  contentClassName?: string;
  autoFocus?: boolean;
  /** Underline, block quotes and tables (stored as <u>, "> " and pipe tables); off where exports do not read them. */
  richBlocks?: boolean;
}>(function SectionTextEditor({ value, onChange, ariaLabel, placeholder, citationLabel, toolbarExtra, contentClassName, autoFocus, richBlocks = false }, ref) {
  const lastEmitted = useRef(normalizeSectionText(value));
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [4] },
        code: false,
        codeBlock: false,
        strike: false,
        horizontalRule: false,
        ...(richBlocks ? {} : { blockquote: false as const, underline: false as const }),
      }),
      ...(richBlocks
        ? [
            TableKit.configure({ table: { resizable: false } }),
            TextAlign.configure({ types: ["heading", "paragraph"], alignments: ["left", "center", "right", "justify"], defaultAlignment: "left" }),
          ]
        : []),
      Placeholder.configure({ placeholder: placeholder ?? "" }),
      citationNode(citationLabel),
    ],
    content: textToDoc(value, { richBlocks }) as unknown as Record<string, unknown>,
    autofocus: autoFocus ? "end" : false,
    onUpdate: ({ editor: ed }) => {
      const text = docToText(ed.getJSON() as unknown as PMNode);
      lastEmitted.current = text;
      onChangeRef.current(text);
    },
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": ariaLabel,
        class: contentClassName ?? "section-editor min-h-[50vh] p-4 sm:p-5 text-[15px] leading-7 font-serif text-[color:var(--text-primary)] focus:outline-none",
      },
    },
  });

  // Text changed from outside (an AI draft, a polish, a referee patch): show it.
  useEffect(() => {
    if (!editor) return;
    const next = normalizeSectionText(value);
    if (next !== lastEmitted.current) {
      lastEmitted.current = next;
      editor.commands.setContent(textToDoc(value, { richBlocks }) as unknown as Record<string, unknown>, { emitUpdate: false });
    }
  }, [editor, value, richBlocks]);

  useImperativeHandle(
    ref,
    () => ({
      insertText: (text) => {
        editor?.chain().focus().insertContent(text).run();
      },
      insertCitation: (id) => {
        if (!editor) return;
        // "reported" + citation → "reported [1]": a space before it when the
        // cursor follows a word; none after, so a full stop can follow.
        const { from } = editor.state.selection;
        const before = from > 1 ? editor.state.doc.textBetween(from - 1, from, "\n", "\ufffc") : "";
        const needsSpace = before !== "" && !/\s/.test(before);
        const content = needsSpace
          ? [{ type: "text", text: " " }, { type: "citation", attrs: { id } }]
          : [{ type: "citation", attrs: { id } }];
        editor.chain().focus().insertContent(content).run();
      },
      selectedText: () => {
        if (!editor) return null;
        const { from, to, empty } = editor.state.selection;
        if (empty) return null;
        const slice = editor.state.doc.cut(from, to).toJSON() as PMNode;
        return docToText(slice) || null;
      },
    }),
    [editor]
  );

  if (!editor) return null;
  return (
    <div className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-canvas)] focus-within:border-[color:var(--accent-border)]">
      <Toolbar editor={editor} extra={toolbarExtra} richBlocks={richBlocks} />
      <EditorContent editor={editor} />
    </div>
  );
});

export default SectionTextEditor;
