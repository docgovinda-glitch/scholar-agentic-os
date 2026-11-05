// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import ResearchSplitCanvas from "../ResearchSplitCanvas";

describe("ResearchSplitCanvas", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders just children when activeLayer is null", () => {
    render(
      <ResearchSplitCanvas
        activeLayer={null}
        onSelectLayer={vi.fn()}
        onClose={vi.fn()}
        canvasContent={<div>Canvas Content</div>}
      >
        <div>Chat Stream Content</div>
      </ResearchSplitCanvas>
    );

    expect(screen.getByText("Chat Stream Content")).toBeInTheDocument();
    expect(screen.queryByText("Canvas Content")).not.toBeInTheDocument();
  });

  it("renders side-by-side split canvas when activeLayer is set and layoutMode is split", () => {
    const handleSelectLayer = vi.fn();
    const handleClose = vi.fn();

    render(
      <ResearchSplitCanvas
        activeLayer="discovery"
        onSelectLayer={handleSelectLayer}
        onClose={handleClose}
        layoutMode="split"
        canvasContent={<div>Discovery Canvas View</div>}
      >
        <div>Chat Stream Content</div>
      </ResearchSplitCanvas>
    );

    expect(screen.getByTestId("research-split-canvas-container")).toBeInTheDocument();
    expect(screen.getByText("Chat Stream Content")).toBeInTheDocument();
    expect(screen.getByText("Discovery Canvas View")).toBeInTheDocument();
    expect(screen.getByText("Discovery Graph")).toBeInTheDocument();
    expect(screen.getByText("Evidence & Forest Plot")).toBeInTheDocument();
    expect(screen.getByText("LaTeX / Overleaf")).toBeInTheDocument();

    // Click on Evidence tab
    fireEvent.click(screen.getByText("Evidence & Forest Plot"));
    expect(handleSelectLayer).toHaveBeenCalledWith("evidence");

    // Click on Close button
    fireEvent.click(screen.getByLabelText("Close Canvas"));
    expect(handleClose).toHaveBeenCalled();
  });

  it("allows switching from split to modal layout and back", () => {
    const handleLayoutModeChange = vi.fn();

    const { rerender } = render(
      <ResearchSplitCanvas
        activeLayer="evidence"
        onSelectLayer={vi.fn()}
        onClose={vi.fn()}
        layoutMode="split"
        onLayoutModeChange={handleLayoutModeChange}
        canvasContent={<div>Evidence View</div>}
      >
        <div>Chat Stream</div>
      </ResearchSplitCanvas>
    );

    // Expand to full-screen modal
    fireEvent.click(screen.getByLabelText("Expand to Full Screen"));
    expect(handleLayoutModeChange).toHaveBeenCalledWith("modal");

    // Rerender with modal layout
    rerender(
      <ResearchSplitCanvas
        activeLayer="evidence"
        onSelectLayer={vi.fn()}
        onClose={vi.fn()}
        layoutMode="modal"
        onLayoutModeChange={handleLayoutModeChange}
        canvasContent={<div>Evidence View</div>}
      >
        <div>Chat Stream</div>
      </ResearchSplitCanvas>
    );

    expect(screen.getByTestId("research-modal-overlay")).toBeInTheDocument();
    // Dock side-by-side button
    const dockBtn = screen.getByTitle(/Dock Side-by-Side/i);
    expect(dockBtn).toBeInTheDocument();
    fireEvent.click(dockBtn);
    expect(handleLayoutModeChange).toHaveBeenCalledWith("split");
  });
});

