// @vitest-environment jsdom
//
// Sci-fi redesign, Step 2 (CommandPalette.tsx) — characterization tests
// written BEFORE the visual redesign, per this project's standing TDD
// discipline. Lock in search/filter/keyboard-nav/action-dispatch behavior
// so the redesign (dark surface, cyan accent, motion language) only ever
// changes classNames/motion variants, never these behaviors.

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import CommandPalette from "../CommandPalette";

afterEach(() => {
  cleanup();
});

function renderPalette(overrides: Partial<React.ComponentProps<typeof CommandPalette>> = {}) {
  const props = {
    isOpen: true,
    onClose: vi.fn(),
    onNavigatePhase: vi.fn(),
    onNavigateTab: vi.fn(),
    onToggleFocusMode: vi.fn(),
    onExportLaTeX: vi.fn(),
    onDownloadDocx: vi.fn(),
    onDownloadPdf: vi.fn(),
    onModelChange: vi.fn(),
    onResetWorkspace: vi.fn(),
    activeModel: "gemini",
    isFocusModeActive: false,
    ...overrides
  };
  render(<CommandPalette {...props} />);
  return props;
}

describe("CommandPalette — behavior preserved across the redesign", () => {
  it("renders nothing when isOpen is false", () => {
    render(
      <CommandPalette
        isOpen={false}
        onClose={vi.fn()}
        onNavigatePhase={vi.fn()}
        onNavigateTab={vi.fn()}
        onToggleFocusMode={vi.fn()}
        onExportLaTeX={vi.fn()}
        onDownloadDocx={vi.fn()}
        onDownloadPdf={vi.fn()}
        onModelChange={vi.fn()}
        onResetWorkspace={vi.fn()}
        activeModel="gemini"
        isFocusModeActive={false}
      />
    );
    expect(screen.queryByPlaceholderText(/Type a research task/)).not.toBeInTheDocument();
  });

  it("renders the search input and command list when open", () => {
    renderPalette();
    expect(screen.getByPlaceholderText(/Type a research task/)).toBeInTheDocument();
    expect(screen.getByText("Open Knowledge Vault")).toBeInTheDocument();
  });

  it("filters commands by typed search text", () => {
    renderPalette();
    const input = screen.getByPlaceholderText(/Type a research task/);
    fireEvent.change(input, { target: { value: "LaTeX" } });
    expect(screen.getByText("Export to LaTeX (.tex)")).toBeInTheDocument();
    expect(screen.queryByText("Open Knowledge Vault")).not.toBeInTheDocument();
  });

  it("clicking a command runs its action and closes the palette", () => {
    const props = renderPalette();
    fireEvent.click(screen.getByText("Open Knowledge Vault"));
    expect(props.onNavigateTab).toHaveBeenCalledWith("vault");
    expect(props.onClose).toHaveBeenCalled();
  });

  it("pressing Escape closes the palette", () => {
    const props = renderPalette();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(props.onClose).toHaveBeenCalled();
  });

  it("pressing Enter runs the currently selected command's action", () => {
    const props = renderPalette();
    fireEvent.keyDown(window, { key: "Enter" });
    expect(props.onNavigatePhase).toHaveBeenCalledWith("A");
  });

  it("the search input is focusable (keyboard entry point)", () => {
    renderPalette();
    const input = screen.getByPlaceholderText(/Type a research task/) as HTMLInputElement;
    input.focus();
    expect(document.activeElement).toBe(input);
  });
});
