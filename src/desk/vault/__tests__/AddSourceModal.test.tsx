// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// Mocks
const mockAddVaultItem = vi.fn();
vi.mock("../../../services/vaultContents", () => ({
  addVaultItem: (...args: unknown[]) => mockAddVaultItem(...args),
}));

const mockResolveDoiMetadata = vi.fn();
const mockResolveUrlMetadata = vi.fn();
vi.mock("../../../services/vault/metadataService", () => ({
  resolveDoiMetadata: (...args: unknown[]) => mockResolveDoiMetadata(...args),
  resolveUrlMetadata: (...args: unknown[]) => mockResolveUrlMetadata(...args),
  generateAPA7Citation: vi.fn(() => "Acharya, Amitav (2024). Towards a Global International Relations?. E-International Relations."),
}));

const { default: AddSourceModal } = await import("../AddSourceModal");

describe("AddSourceModal — Streamlined 1-Step Intake", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders a single-step dialog with smart input and core fields", () => {
    render(
      <AddSourceModal
        userId="user-1"
        existingItems={[]}
        onClose={vi.fn()}
        onSourceSaved={vi.fn()}
      />
    );

    expect(screen.getByRole("heading", { name: "Add Source" })).toBeInTheDocument();
    expect(screen.getByLabelText(/URL, DOI, or Reference/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Title/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Authors/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Publication Year/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Journal \/ Publisher/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Source" })).toBeInTheDocument();
  });

  it("fetches and populates URL metadata seamlessly", async () => {
    mockResolveUrlMetadata.mockResolvedValueOnce({
      success: true,
      confidence: "verified",
      metadata: {
        title: "Towards a Global International Relations?",
        authors: ["Amitav Acharya"],
        year: "2024",
        publisher: "E-International Relations",
        journal: "",
        doi: "",
        url: "https://www.e-ir.org/p/towards-a-global-international-relations",
        type: "website",
      },
    });

    render(
      <AddSourceModal
        userId="user-1"
        existingItems={[]}
        onClose={vi.fn()}
        onSourceSaved={vi.fn()}
      />
    );

    const input = screen.getByLabelText(/URL, DOI, or Reference/i);
    fireEvent.change(input, {
      target: { value: "https://www.e-ir.org/p/towards-a-global-international-relations" },
    });

    const fetchBtn = screen.getByRole("button", { name: "Fetch" });
    fireEvent.click(fetchBtn);

    await waitFor(() => {
      expect(mockResolveUrlMetadata).toHaveBeenCalledWith(
        "https://www.e-ir.org/p/towards-a-global-international-relations"
      );
    });

    await waitFor(() => {
      const titleInput = screen.getByLabelText(/^Title/i) as HTMLInputElement;
      expect(titleInput.value).toBe("Towards a Global International Relations?");
      const authorsInput = screen.getByLabelText(/Authors/i) as HTMLInputElement;
      expect(authorsInput.value).toBe("Amitav Acharya");
      const yearInput = screen.getByLabelText(/Publication Year/i) as HTMLInputElement;
      expect(yearInput.value).toBe("2024");
      const journalInput = screen.getByLabelText(/Journal \/ Publisher/i) as HTMLInputElement;
      expect(journalInput.value).toBe("E-International Relations");
    });
  });

  it("fetches and populates DOI metadata directly", async () => {
    mockResolveDoiMetadata.mockResolvedValueOnce({
      success: true,
      confidence: "verified",
      metadata: {
        title: "Attention Is All You Need",
        authors: ["Vaswani, Ashish", "Shazeer, Noam"],
        year: "2017",
        journal: "NeurIPS",
        doi: "10.48550/arXiv.1706.03762",
        url: "https://doi.org/10.48550/arXiv.1706.03762",
        type: "paper",
      },
    });

    render(
      <AddSourceModal
        userId="user-1"
        existingItems={[]}
        onClose={vi.fn()}
        onSourceSaved={vi.fn()}
      />
    );

    const input = screen.getByLabelText(/URL, DOI, or Reference/i);
    fireEvent.change(input, { target: { value: "10.48550/arXiv.1706.03762" } });

    fireEvent.click(screen.getByRole("button", { name: "Fetch" }));

    await waitFor(() => {
      expect(mockResolveDoiMetadata).toHaveBeenCalledWith("10.48550/arxiv.1706.03762");
    });

    await waitFor(() => {
      const titleInput = screen.getByLabelText(/^Title/i) as HTMLInputElement;
      expect(titleInput.value).toBe("Attention Is All You Need");
      const authorsInput = screen.getByLabelText(/Authors/i) as HTMLInputElement;
      expect(authorsInput.value).toBe("Vaswani, Ashish, Shazeer, Noam");
    });
  });

  it("parses pasted BibTeX snippet automatically", async () => {
    render(
      <AddSourceModal
        userId="user-1"
        existingItems={[]}
        onClose={vi.fn()}
        onSourceSaved={vi.fn()}
      />
    );

    const input = screen.getByLabelText(/URL, DOI, or Reference/i);
    fireEvent.change(input, {
      target: {
        value: `@article{test2024, title={Deep Learning Survey}, author={LeCun, Yann}, year={2024}, journal={AI Review}}`,
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Fetch" }));

    await waitFor(() => {
      const titleInput = screen.getByLabelText(/^Title/i) as HTMLInputElement;
      expect(titleInput.value).toBe("Deep Learning Survey");
      const authorsInput = screen.getByLabelText(/Authors/i) as HTMLInputElement;
      expect(authorsInput.value).toBe("LeCun, Yann");
      const yearInput = screen.getByLabelText(/Publication Year/i) as HTMLInputElement;
      expect(yearInput.value).toBe("2024");
    });
  });

  it("saves source directly and calls onSourceSaved + onClose", async () => {
    const fakeSavedItem = {
      id: "vault-item-123",
      title: "Clean Energy Transitions",
      authors: ["IEA"],
      year: "2023",
      content: "",
      createdAt: "2026-01-01",
    };
    mockAddVaultItem.mockResolvedValueOnce(fakeSavedItem);

    const onClose = vi.fn();
    const onSourceSaved = vi.fn();

    render(
      <AddSourceModal
        userId="user-1"
        existingItems={[]}
        onClose={onClose}
        onSourceSaved={onSourceSaved}
      />
    );

    // Enter title directly
    const titleInput = screen.getByLabelText(/^Title/i);
    fireEvent.change(titleInput, { target: { value: "Clean Energy Transitions" } });

    const saveBtn = screen.getByRole("button", { name: "Save Source" });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockAddVaultItem).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({
          title: "Clean Energy Transitions",
        })
      );
      expect(onSourceSaved).toHaveBeenCalledWith(fakeSavedItem);
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("shows duplicate warning if source already exists in library", async () => {
    const existing = [
      {
        id: "existing-1",
        title: "Towards a Global International Relations?",
        content: "",
        createdAt: "2026-01-01",
      },
    ] as any;

    mockResolveUrlMetadata.mockResolvedValueOnce({
      success: true,
      confidence: "verified",
      metadata: {
        title: "Towards a Global International Relations?",
        authors: ["Amitav Acharya"],
        year: "2024",
        url: "https://www.e-ir.org/p/towards-a-global-international-relations",
      },
    });

    render(
      <AddSourceModal
        userId="user-1"
        existingItems={existing}
        onClose={vi.fn()}
        onSourceSaved={vi.fn()}
      />
    );

    const input = screen.getByLabelText(/URL, DOI, or Reference/i);
    fireEvent.change(input, {
      target: { value: "https://www.e-ir.org/p/towards-a-global-international-relations" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Fetch" }));

    await waitFor(() => {
      expect(screen.getByText(/Already in Vault/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Save Anyway" })).toBeInTheDocument();
    });
  });
});
