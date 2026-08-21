// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CitationConfirmationModal } from "../CitationConfirmationModal";

describe("CitationConfirmationModal", () => {
  it("renders with initial reference data and shows completeness indicator", () => {
    const handleConfirm = vi.fn();
    const handleClose = vi.fn();

    render(
      <CitationConfirmationModal
        initialReference={{
          kind: "JournalArticle",
          title: "Attention Is All You Need",
          authors: [{ firstName: "Ashish", lastName: "Vaswani", order: 1 }],
          source: "NeurIPS",
          year: "2017",
        }}
        onConfirm={handleConfirm}
        onClose={handleClose}
      />
    );

    expect(screen.getByText("Confirm Citation Metadata")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Attention Is All You Need")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Vaswani")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2017")).toBeInTheDocument();
    expect(screen.getByText("Citation Ready for Confirmation")).toBeInTheDocument();
  });

  it("indicates missing fields for incomplete reference and disables confirm button", () => {
    const handleConfirm = vi.fn();
    const handleClose = vi.fn();

    render(
      <CitationConfirmationModal
        initialReference={{
          kind: "JournalArticle",
          title: "",
          authors: [],
        }}
        onConfirm={handleConfirm}
        onClose={handleClose}
      />
    );

    expect(screen.getByText("Incomplete Citation Metadata")).toBeInTheDocument();
    const submitBtn = screen.getByRole("button", { name: /Confirm Citation Metadata/i });
    expect(submitBtn).toBeDisabled();
  });

  it("submits confirmed CanonicalReference and formatted citation when valid", async () => {
    const handleConfirm = vi.fn();
    const handleClose = vi.fn();

    render(
      <CitationConfirmationModal
        initialReference={{
          kind: "JournalArticle",
          title: "Attention Is All You Need",
          authors: [{ firstName: "Ashish", lastName: "Vaswani", order: 1 }],
          source: "NeurIPS",
          year: "2017",
        }}
        onConfirm={handleConfirm}
        onClose={handleClose}
      />
    );

    const submitBtn = screen.getByRole("button", { name: /Confirm Citation Metadata/i });
    expect(submitBtn).toBeEnabled();

    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(handleConfirm).toHaveBeenCalledTimes(1);
      const confirmedRef = handleConfirm.mock.calls[0][0];
      expect(confirmedRef.title).toBe("Attention Is All You Need");
      expect(confirmedRef.authors[0].lastName).toBe("Vaswani");
      expect(handleClose).toHaveBeenCalledTimes(1);
    });
  });
});
