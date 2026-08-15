// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import Primary from "../Primary";
import type { CanonicalDocument } from "../../types";

afterEach(() => cleanup());

const DOCUMENT: CanonicalDocument = {
  id: "doc-1",
  title: "A Paper",
  blocks: [{ id: "introduction", kind: "paragraph", text: "Supported [ev-1]." }],
};

function noop() {}

describe("Primary — resolve citations action", () => {
  it("does not render the resolve-citations control when onResolveCitations isn't supplied", () => {
    render(<Primary document={DOCUMENT} onSubmitPlainText={noop} onSaveDocument={noop} submitting={false} projectId="p1" />);
    expect(screen.queryByRole("button", { name: "Resolve citations" })).not.toBeInTheDocument();
  });

  it("shows a success outcome after resolving, including unresolved markers if any", async () => {
    const onResolveCitations = vi.fn().mockResolvedValue({ citedSourceIds: ["s1", "s2"], unresolvedIds: ["ev-stale"] });
    render(
      <Primary
        document={DOCUMENT}
        onSubmitPlainText={noop}
        onSaveDocument={noop}
        submitting={false}
        projectId="p1"
        onResolveCitations={onResolveCitations}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Resolve citations" }));
    expect(onResolveCitations).toHaveBeenCalled();

    await waitFor(() => expect(screen.getByText(/Resolved 2 source\(s\)/)).toBeInTheDocument());
    expect(screen.getByText(/ev-stale/)).toBeInTheDocument();
  });

  it("shows a 'nothing to resolve' outcome when there are no citation markers", async () => {
    const onResolveCitations = vi.fn().mockResolvedValue({ citedSourceIds: [], unresolvedIds: [] });
    render(
      <Primary
        document={DOCUMENT}
        onSubmitPlainText={noop}
        onSaveDocument={noop}
        submitting={false}
        projectId="p1"
        onResolveCitations={onResolveCitations}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Resolve citations" }));
    await waitFor(() => expect(screen.getByText(/Nothing to resolve/)).toBeInTheDocument());
  });

  it("shows an error message when resolving fails", async () => {
    const onResolveCitations = vi.fn().mockRejectedValue(new Error("Unknown citation style"));
    render(
      <Primary
        document={DOCUMENT}
        onSubmitPlainText={noop}
        onSaveDocument={noop}
        submitting={false}
        projectId="p1"
        onResolveCitations={onResolveCitations}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Resolve citations" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Unknown citation style"));
  });
});
