// @vitest-environment jsdom
//
// The Rail's Outline tab (docs 22 §2/§3).
//
// Before this, "no document yet" was the same flat message for every output
// type — the sidebar carried no information about what kind of document the
// project actually was. Atlas already models a per-type structure
// (structure.sections, with nested children for chapter_based types like a
// doctoral dissertation); this wires that into the one place in Desk a user
// would look to see "what am I supposed to be writing".

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const getOutputTypeSpec = vi.fn();
vi.mock("../api", () => ({
  getOutputTypeSpec: (...a: unknown[]) => getOutputTypeSpec(...a),
}));

const { default: Rail } = await import("../regions/Rail");

const section = (over: Record<string, unknown> = {}) => ({
  key: "introduction",
  title: "Introduction",
  required: true,
  guidance: "States the research question and why it matters.",
  ...over,
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("before a document exists", () => {
  it("shows the planned structure for this output type instead of a flat empty message", async () => {
    getOutputTypeSpec.mockResolvedValue({
      structure: { variant: "flat", sections: [section(), section({ key: "methods", title: "Methods", required: true })] },
    });

    render(<Rail document={null} outputTypeId="OT-06" onJumpToBlock={vi.fn()} />);

    expect(await screen.findByText("Introduction")).toBeInTheDocument();
    expect(screen.getByText("Methods")).toBeInTheDocument();
    expect(screen.queryByText("No document submitted yet.")).not.toBeInTheDocument();
  });

  it("marks optional sections as optional, not just listing them the same as required ones", async () => {
    getOutputTypeSpec.mockResolvedValue({
      structure: { variant: "flat", sections: [section({ key: "appendix", title: "Appendix", required: false })] },
    });

    render(<Rail document={null} outputTypeId="OT-06" onJumpToBlock={vi.fn()} />);

    const appendix = await screen.findByText("Appendix");
    expect(appendix.parentElement).toHaveTextContent("optional");
  });

  it("nests chapter children under their chapter, for chapter_based types", async () => {
    getOutputTypeSpec.mockResolvedValue({
      structure: {
        variant: "chapter_based",
        sections: [
          {
            key: "chapter-1",
            title: "Chapter 1: Literature Review",
            required: true,
            guidance: "",
            children: [section({ key: "ch1-intro", title: "1.1 Overview" })],
          },
        ],
      },
    });

    render(<Rail document={null} outputTypeId="OT-07" onJumpToBlock={vi.fn()} />);

    expect(await screen.findByText("Chapter 1: Literature Review")).toBeInTheDocument();
    expect(screen.getByText("1.1 Overview")).toBeInTheDocument();
  });

  it("re-fetches when the output type changes, so switching projects shows the right structure", async () => {
    getOutputTypeSpec.mockResolvedValueOnce({
      structure: { variant: "flat", sections: [section({ key: "a", title: "Essay-only section" })] },
    });
    const { rerender } = render(<Rail document={null} outputTypeId="OT-02" onJumpToBlock={vi.fn()} />);
    await screen.findByText("Essay-only section");

    getOutputTypeSpec.mockResolvedValueOnce({
      structure: { variant: "flat", sections: [section({ key: "b", title: "Thesis-only section" })] },
    });
    rerender(<Rail document={null} outputTypeId="OT-08" onJumpToBlock={vi.fn()} />);

    expect(await screen.findByText("Thesis-only section")).toBeInTheDocument();
    expect(getOutputTypeSpec).toHaveBeenCalledWith("OT-02");
    expect(getOutputTypeSpec).toHaveBeenCalledWith("OT-08");
  });
});

describe("once a document exists", () => {
  it("shows the real document outline, not the planned structure", async () => {
    getOutputTypeSpec.mockResolvedValue({
      structure: { variant: "flat", sections: [section({ key: "a", title: "Planned-only section" })] },
    });

    const document = {
      id: "doc-1",
      title: "My Paper",
      blocks: [
        { id: "b1", kind: "heading1" as const, text: "Real Heading" },
        { id: "b2", kind: "paragraph" as const, text: "Body text." },
      ],
    };
    render(<Rail document={document} outputTypeId="OT-06" onJumpToBlock={vi.fn()} />);

    expect(await screen.findByText("Real Heading")).toBeInTheDocument();
    expect(screen.queryByText("Planned-only section")).not.toBeInTheDocument();
  });

  it("jumps to the block when a real outline entry is clicked", async () => {
    const onJumpToBlock = vi.fn();
    const document = {
      id: "doc-1",
      title: "My Paper",
      blocks: [{ id: "b1", kind: "heading1" as const, text: "Real Heading" }],
    };
    render(<Rail document={document} outputTypeId="OT-06" onJumpToBlock={onJumpToBlock} />);

    fireEvent.click(await screen.findByText("Real Heading"));
    expect(onJumpToBlock).toHaveBeenCalledWith("b1");
  });
});

describe("other tabs", () => {
  it("renders the Sources panel when clicking the Sources tab", async () => {
    getOutputTypeSpec.mockResolvedValue({ structure: { variant: "flat", sections: [] } });
    render(<Rail projectId="p1" document={null} outputTypeId="OT-06" onJumpToBlock={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Sources" }));
    expect(screen.getByPlaceholderText("Search corpus...")).toBeInTheDocument();
  });
});
