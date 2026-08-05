// @vitest-environment jsdom
//
// Uploading a document, or looking up a DOI — /api/parse-file and
// /api/lookup-doi already existed and already worked (the legacy client's
// KnowledgeVaultWizard used them), but nothing in Desk's Vault called
// either. This is the preview-then-confirm UI around them: a file or a DOI
// lookup produces exactly one item, previewed before it's saved (UX5 — a
// wrong upload should be obvious before it's in the Vault).

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const addVaultItem = vi.fn();
vi.mock("../../../services/vaultContents", () => ({
  addVaultItem: (...a: unknown[]) => addVaultItem(...a),
}));

const { default: VaultDocumentImport } = await import("../VaultDocumentImport");

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  cleanup();
  vi.clearAllMocks();
});

function mockFetchOnce(body: unknown, ok = true) {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    json: async () => body,
  }) as unknown as typeof fetch;
}

function open() {
  render(<VaultDocumentImport userId="user-1" onImported={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Upload a document or look up a DOI" }));
}

describe("uploading a file", () => {
  it("sends the file's contents to /api/parse-file and previews the extracted text", async () => {
    mockFetchOnce({ text: "Extracted body text.", metadata: { fileName: "notes.pdf" } });
    open();

    const file = new File(["hello"], "notes.pdf", { type: "application/pdf" });
    const input = screen.getByLabelText("Upload a document");
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByText("notes.pdf")).toBeInTheDocument();
    expect(screen.getByText("Extracted body text.")).toBeInTheDocument();

    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/parse-file");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.fileName).toBe("notes.pdf");
    expect(typeof body.fileContent).toBe("string");
  });

  it("saves the previewed item to the Vault only after confirming", async () => {
    mockFetchOnce({ text: "Extracted body text.", metadata: { fileName: "notes.pdf" } });
    const onImported = vi.fn();
    render(<VaultDocumentImport userId="user-1" onImported={onImported} />);
    fireEvent.click(screen.getByRole("button", { name: "Upload a document or look up a DOI" }));

    const file = new File(["hello"], "notes.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("Upload a document"), { target: { files: [file] } });
    await screen.findByText("notes.pdf");

    expect(addVaultItem).not.toHaveBeenCalled();
    addVaultItem.mockResolvedValue({ id: "1", title: "notes.pdf", content: "Extracted body text.", createdAt: "now" });
    fireEvent.click(screen.getByRole("button", { name: "Add to Vault" }));

    await waitFor(() =>
      expect(addVaultItem).toHaveBeenCalledWith("user-1", { title: "notes.pdf", content: "Extracted body text." })
    );
    await waitFor(() => expect(onImported).toHaveBeenCalled());
  });

  it("surfaces a parse failure as an announced error", async () => {
    mockFetchOnce({ error: "Could not read that file." }, false);
    open();

    const file = new File(["hello"], "broken.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("Upload a document"), { target: { files: [file] } });

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not read that file.");
  });
});

describe("looking up a DOI", () => {
  it("switches mode and previews the CrossRef result, including a real citation", async () => {
    mockFetchOnce({
      text: "Title: The Rise of AI\nAuthor(s): Smith, John",
      metadata: { title: "The Rise of AI", bibtex: "@article{doi_x, title={The Rise of AI}}" },
    });
    open();

    fireEvent.click(screen.getByRole("button", { name: "Look up a DOI" }));
    fireEvent.change(screen.getByLabelText("DOI"), { target: { value: "10.1234/example" } });
    fireEvent.click(screen.getByRole("button", { name: "Look up" }));

    expect(await screen.findByText("The Rise of AI")).toBeInTheDocument();

    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/lookup-doi");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ doi: "10.1234/example" });
  });

  it("saves the citation alongside the item", async () => {
    mockFetchOnce({
      text: "Title: The Rise of AI",
      metadata: { title: "The Rise of AI", bibtex: "@article{doi_x, title={The Rise of AI}}" },
    });
    open();

    fireEvent.click(screen.getByRole("button", { name: "Look up a DOI" }));
    fireEvent.change(screen.getByLabelText("DOI"), { target: { value: "10.1234/example" } });
    fireEvent.click(screen.getByRole("button", { name: "Look up" }));
    await screen.findByText("The Rise of AI");

    addVaultItem.mockResolvedValue({ id: "1", title: "The Rise of AI", content: "", createdAt: "now" });
    fireEvent.click(screen.getByRole("button", { name: "Add to Vault" }));

    await waitFor(() =>
      expect(addVaultItem).toHaveBeenCalledWith("user-1", {
        title: "The Rise of AI",
        content: "Title: The Rise of AI",
        citation: "@article{doi_x, title={The Rise of AI}}",
      })
    );
  });

  it("cannot submit a blank DOI", async () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Look up a DOI" }));
    expect(screen.getByRole("button", { name: "Look up" })).toBeDisabled();
  });
});

describe("discarding and cancelling", () => {
  it("can discard a preview without saving it", async () => {
    mockFetchOnce({ text: "x", metadata: { fileName: "notes.pdf" } });
    open();

    fireEvent.change(screen.getByLabelText("Upload a document"), {
      target: { files: [new File(["hello"], "notes.pdf")] },
    });
    await screen.findByText("notes.pdf");

    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(screen.queryByText("notes.pdf")).not.toBeInTheDocument();
    expect(addVaultItem).not.toHaveBeenCalled();
  });

  it("closes entirely on Cancel", async () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Upload a document")).not.toBeInTheDocument();
  });
});
