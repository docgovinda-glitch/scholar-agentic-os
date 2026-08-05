// @vitest-environment jsdom
//
// BibTeX/RIS reference import — the concrete thing behind "Zotero, Mendeley,
// EndNote and BibTeX import" in VaultSetupScreen's copy.
//
// The one rule worth pinning: nothing is saved to the Vault until the user
// has seen a preview and confirmed it. Parsing on paste and saving on parse
// would mean a wrong file pasted by mistake becomes dozens of vault items
// before anyone noticed.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const addVaultItems = vi.fn();
vi.mock("../../../services/vaultContents", () => ({ addVaultItems: (...a: unknown[]) => addVaultItems(...a) }));

const { default: VaultImport } = await import("../VaultImport");

const BIBTEX = `@article{smith2020ai,
  author = {Smith, John},
  title = {The Rise of AI in Research},
  journal = {Journal of Computing},
  year = {2020}
}`;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("collapsed by default", () => {
  it("shows only the opener until asked for", () => {
    render(<VaultImport userId="user-1" onImported={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Import references" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Reference export text")).not.toBeInTheDocument();
  });
});

describe("previewing before saving", () => {
  it("does not save anything on parse alone", () => {
    render(<VaultImport userId="user-1" onImported={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Import references" }));

    fireEvent.change(screen.getByLabelText("Reference export text"), { target: { value: BIBTEX } });
    fireEvent.click(screen.getByRole("button", { name: "Preview import" }));

    expect(screen.getByText("The Rise of AI in Research")).toBeInTheDocument();
    expect(addVaultItems).not.toHaveBeenCalled();
  });

  it("saves only after the explicit confirm, with the parsed items", async () => {
    const saved = [{ id: "x", title: "The Rise of AI in Research", content: "...", createdAt: "2026-01-01" }];
    addVaultItems.mockResolvedValue(saved);
    const onImported = vi.fn();
    render(<VaultImport userId="user-1" onImported={onImported} />);

    fireEvent.click(screen.getByRole("button", { name: "Import references" }));
    fireEvent.change(screen.getByLabelText("Reference export text"), { target: { value: BIBTEX } });
    fireEvent.click(screen.getByRole("button", { name: "Preview import" }));
    fireEvent.click(screen.getByRole("button", { name: "Add 1 to Vault" }));

    await waitFor(() => expect(addVaultItems).toHaveBeenCalledWith("user-1", expect.any(Array)));
    const [, items] = addVaultItems.mock.calls[0];
    expect(items[0].title).toBe("The Rise of AI in Research");
    expect(onImported).toHaveBeenCalledWith(saved);
  });

  it("names what could not be parsed rather than failing silently", () => {
    render(<VaultImport userId="user-1" onImported={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Import references" }));

    fireEvent.change(screen.getByLabelText("Reference export text"), { target: { value: "not an export at all" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview import" }));

    expect(screen.getByText(/could not recognize/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Add \d+ to Vault/ })).not.toBeInTheDocument();
  });

  it("closes without importing anything on cancel", () => {
    render(<VaultImport userId="user-1" onImported={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Import references" }));
    fireEvent.change(screen.getByLabelText("Reference export text"), { target: { value: BIBTEX } });

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("button", { name: "Import references" })).toBeInTheDocument();
    expect(addVaultItems).not.toHaveBeenCalled();
  });

  it("reads an uploaded file into the text area", async () => {
    render(<VaultImport userId="user-1" onImported={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Import references" }));

    const file = new File([BIBTEX], "library.bib", { type: "text/plain" });
    fireEvent.change(screen.getByLabelText("Upload a BibTeX or RIS file"), { target: { files: [file] } });

    await waitFor(() => expect(screen.getByLabelText("Reference export text")).toHaveValue(BIBTEX));
  });
});
