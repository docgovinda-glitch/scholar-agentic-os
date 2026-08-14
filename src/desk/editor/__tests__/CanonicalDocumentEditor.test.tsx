// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import CanonicalDocumentEditor from "../CanonicalDocumentEditor";
import type { CanonicalDocument } from "../../types";

// jsdom doesn't implement Range.getClientRects/getBoundingClientRect, which
// ProseMirror's focus()/scrollIntoView() call on every toolbar command —
// without this, clicking a toolbar button throws asynchronously from inside
// ProseMirror's own dispatch (an unhandled rejection not attributable to any
// one assertion). Scoped to this file rather than the global test setup:
// nothing outside TipTap-backed components needs it.
if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList;
}
if (!Range.prototype.getBoundingClientRect) {
  Range.prototype.getBoundingClientRect = () =>
    ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON() {} }) as DOMRect;
}

afterEach(() => cleanup());

const DOC: CanonicalDocument = {
  id: "doc-1",
  title: "T",
  blocks: [
    { id: "b1", kind: "heading1", text: "Introduction" },
    { id: "b2", kind: "paragraph", text: "Some opening prose." },
  ],
};

describe("Desk — CanonicalDocumentEditor", () => {
  it("renders the document's existing content", async () => {
    render(<CanonicalDocumentEditor document={DOC} onSave={vi.fn()} saving={false} />);
    expect(await screen.findByText("Introduction")).toBeInTheDocument();
    expect(screen.getByText("Some opening prose.")).toBeInTheDocument();
  });

  it("Save is disabled until the user actually edits something", async () => {
    render(<CanonicalDocumentEditor document={DOC} onSave={vi.fn()} saving={false} />);
    await screen.findByText("Introduction");
    expect(screen.getByRole("button", { name: "Saved" })).toBeDisabled();
  });

  it("calls onSave with an updated CanonicalDocument after a structural edit (toggling a heading to a paragraph)", async () => {
    const onSave = vi.fn();
    render(<CanonicalDocumentEditor document={DOC} onSave={onSave} saving={false} />);
    await screen.findByText("Introduction");

    // Click into the heading, then toggle it to a paragraph via the toolbar
    // — a real structural edit, not a no-op re-save.
    fireEvent.click(screen.getByText("Introduction"));
    fireEvent.click(screen.getByRole("button", { name: "Paragraph" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0] as CanonicalDocument;
    expect(saved.blocks.find((b) => b.text === "Introduction")?.kind).toBe("paragraph");
    // The untouched block keeps its original id and kind.
    expect(saved.blocks.find((b) => b.id === "b2")).toMatchObject({ kind: "paragraph", text: "Some opening prose." });
  });

  it("shows a placeholder and starts empty for a document with no blocks yet", async () => {
    const empty: CanonicalDocument = { id: "doc-empty", title: "T", blocks: [] };
    const { container } = render(<CanonicalDocumentEditor document={empty} onSave={vi.fn()} saving={false} />);
    await waitFor(() => expect(container.querySelector(".tiptap-editor")).toBeInTheDocument());
    expect(container.querySelector('[data-placeholder="Start writing…"]')).toBeInTheDocument();
  });

  it("shows 'Saving…' and disables Save while a save is in flight", async () => {
    render(<CanonicalDocumentEditor document={DOC} onSave={vi.fn()} saving />);
    await screen.findByText("Introduction");
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  });
});
