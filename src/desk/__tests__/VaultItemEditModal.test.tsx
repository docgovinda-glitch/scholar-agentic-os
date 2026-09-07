// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import VaultItemEditModal from "../vault/VaultItemEditModal";
import type { VaultItem } from "../../services/vaultContents";

const updateVaultItemDetails = vi.fn();
vi.mock("../../services/vaultContents", async () => {
  const actual = await vi.importActual<typeof import("../../services/vaultContents")>("../../services/vaultContents");
  return {
    ...actual,
    updateVaultItemDetails: (...a: unknown[]) => updateVaultItemDetails(...a),
  };
});

const sampleItem: VaultItem = {
  id: "item-123",
  title: "A Study on Quantum Memory",
  content: "Details about quantum memory protocols.",
  citation: "Smith et al., 2024",
  collection: "Quantum Computing",
  tags: ["quantum", "memory"],
  authors: ["Alice Smith", "Bob Jones"],
  year: "2024",
  journal: "Physical Review Letters",
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("VaultItemEditModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders existing document fields and tags", () => {
    render(
      <VaultItemEditModal
        userId="user-1"
        item={sampleItem}
        existingCollections={["Quantum Computing", "Biology"]}
        allExistingTags={["quantum", "memory", "physics"]}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByDisplayValue("A Study on Quantum Memory")).toBeInTheDocument();
    expect(screen.getByText("#quantum")).toBeInTheDocument();
    expect(screen.getByText("#memory")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Alice Smith, Bob Jones")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2024")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Physical Review Letters")).toBeInTheDocument();
  });

  it("allows adding and removing tags", () => {
    render(
      <VaultItemEditModal
        userId="user-1"
        item={sampleItem}
        existingCollections={["Quantum Computing"]}
        allExistingTags={["quantum", "memory", "optics"]}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );

    // Add tag via input
    const tagInput = screen.getByPlaceholderText(/Type tag and press Enter/i);
    fireEvent.change(tagInput, { target: { value: "optics" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(screen.getByText("#optics")).toBeInTheDocument();

    // Remove tag
    const removeButtons = screen.getAllByRole("button", { name: "×" });
    fireEvent.click(removeButtons[0]); // removes quantum
    expect(screen.queryByText("#quantum")).not.toBeInTheDocument();
  });

  it("saves modified details including new collection and author list", async () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    updateVaultItemDetails.mockResolvedValue({
      ...sampleItem,
      title: "Updated Quantum Title",
      collection: "Advanced Quantum",
      tags: ["quantum", "memory", "superconducting"],
    });

    render(
      <VaultItemEditModal
        userId="user-1"
        item={sampleItem}
        existingCollections={["Quantum Computing"]}
        allExistingTags={["quantum", "memory"]}
        onSave={onSave}
        onClose={onClose}
      />
    );

    // Switch to new collection input
    fireEvent.click(screen.getByText("+ New Collection"));
    fireEvent.change(screen.getByPlaceholderText(/e.g., Literature Review/i), {
      target: { value: "Advanced Quantum" },
    });

    // Update title
    fireEvent.change(screen.getByDisplayValue("A Study on Quantum Memory"), {
      target: { value: "Updated Quantum Title" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => {
      expect(updateVaultItemDetails).toHaveBeenCalledWith(
        "user-1",
        "item-123",
        expect.objectContaining({
          title: "Updated Quantum Title",
          collection: "Advanced Quantum",
        })
      );
      expect(onSave).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });
});
