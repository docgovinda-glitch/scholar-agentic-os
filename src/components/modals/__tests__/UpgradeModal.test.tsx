// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { UpgradeModal } from "../UpgradeModal";

describe("UpgradeModal Component", () => {
  it("renders with exact required titles and copy when open", () => {
    render(<UpgradeModal isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByText("Unlock Unlimited Document Analysis")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Free accounts are limited to standard brief files. Upgrade to Scholar Pro for unlimited high-capacity document processing and lecture syllabus grounding."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upgrade to Pro" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("does not render when isOpen is false", () => {
    const { container } = render(<UpgradeModal isOpen={false} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("calls onClose when Cancel button is clicked", () => {
    const onClose = vi.fn();
    render(<UpgradeModal isOpen={true} onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onUpgrade when Upgrade to Pro is clicked", () => {
    const onUpgrade = vi.fn();
    const onClose = vi.fn();
    render(<UpgradeModal isOpen={true} onClose={onClose} onUpgrade={onUpgrade} />);

    fireEvent.click(screen.getByRole("button", { name: "Upgrade to Pro" }));
    expect(onUpgrade).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes when Escape key is pressed", () => {
    const onClose = vi.fn();
    render(<UpgradeModal isOpen={true} onClose={onClose} />);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
