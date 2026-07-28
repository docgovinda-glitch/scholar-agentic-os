// @vitest-environment jsdom
//
// AI modes redesign, Step 1 — tests for the shared AIModeCard component,
// written before wiring it into AISetupWizard.tsx/AIControlCenter.tsx.

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import AIModeCard from "../ai/AIModeCard";
import { AI_MODES, getAIMode } from "../../config/aiModes";

afterEach(() => {
  cleanup();
});

describe("AIModeCard — available mode", () => {
  const smart = getAIMode("smart")!;

  it("renders title, badge, description, and CTA", () => {
    render(<AIModeCard mode={smart} isSelected={false} onSelect={vi.fn()} />);
    expect(screen.getByText("Smart AI")).toBeInTheDocument();
    expect(screen.getByText("Fastest to start")).toBeInTheDocument();
    expect(screen.getByText(smart.description)).toBeInTheDocument();
    expect(screen.getByText(smart.ctaLabel)).toBeInTheDocument();
  });

  it("clicking the card calls onSelect with the mode id", () => {
    const onSelect = vi.fn();
    render(<AIModeCard mode={smart} isSelected={false} onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId("ai-mode-card-smart"));
    expect(onSelect).toHaveBeenCalledWith("smart");
  });

  it("clicking the CTA button also calls onSelect (without double-navigating past the card)", () => {
    const onSelect = vi.fn();
    render(<AIModeCard mode={smart} isSelected={false} onSelect={onSelect} />);
    fireEvent.click(screen.getByText(smart.ctaLabel));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("is keyboard-activatable via Enter and Space", () => {
    const onSelect = vi.fn();
    render(<AIModeCard mode={smart} isSelected={false} onSelect={onSelect} />);
    const card = screen.getByTestId("ai-mode-card-smart");
    fireEvent.keyDown(card, { key: "Enter" });
    fireEvent.keyDown(card, { key: " " });
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it("shows a checkmark and aria-pressed=true when selected", () => {
    render(<AIModeCard mode={smart} isSelected={true} onSelect={vi.fn()} />);
    const card = screen.getByTestId("ai-mode-card-smart");
    expect(card).toHaveAttribute("aria-pressed", "true");
  });

  it("How it works and Requirements start collapsed and expand on click", () => {
    const { container } = render(<AIModeCard mode={smart} isSelected={false} onSelect={vi.fn()} />);
    expect(screen.queryByText(smart.howItWorks[0])).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("How it works"));
    expect(screen.getByText(smart.howItWorks[0])).toBeInTheDocument();

    expect(container.textContent).not.toContain(smart.requirements[0]);
    fireEvent.click(screen.getByText("Requirements"));
    expect(container.textContent).toContain(smart.requirements[0]);
  });

  it("expanding How it works does not also trigger onSelect", () => {
    const onSelect = vi.fn();
    render(<AIModeCard mode={smart} isSelected={false} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("How it works"));
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe("AIModeCard — coming-soon mode", () => {
  const partner = getAIMode("partner")!;

  it("renders the coming-soon note and a disabled, non-clickable CTA", () => {
    const onSelect = vi.fn();
    render(<AIModeCard mode={partner} isSelected={false} onSelect={onSelect} />);
    expect(screen.getByText(partner.comingSoonNote!)).toBeInTheDocument();
    const cta = screen.getByText(partner.ctaLabel);
    expect(cta).toBeDisabled();

    fireEvent.click(screen.getByTestId("ai-mode-card-partner"));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("is not keyboard-focusable (tabIndex -1) and marked aria-disabled", () => {
    render(<AIModeCard mode={partner} isSelected={false} onSelect={vi.fn()} />);
    const card = screen.getByTestId("ai-mode-card-partner");
    expect(card).toHaveAttribute("tabindex", "-1");
    expect(card).toHaveAttribute("aria-disabled", "true");
  });
});

describe("AIModeCard — renders every real mode without crashing", () => {
  it.each(AI_MODES.map((m) => [m.id, m]))("renders %s", (_id, mode) => {
    render(<AIModeCard mode={mode as any} isSelected={false} onSelect={vi.fn()} />);
    cleanup();
  });
});
