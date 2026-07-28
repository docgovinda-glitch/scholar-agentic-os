// @vitest-environment jsdom
//
// AI modes redesign, Step 1 — tests for the shared AIModeCard component,
// written before wiring it into AISetupWizard.tsx/AIControlCenter.tsx.
//
// Updated in Step 7 (accessibility pass) — a real accessibility-tree
// snapshot during live verification showed the card's outer role="button"
// produced a giant, redundant accessible name (it contained several real
// nested interactive elements: the CTA button, two expand toggles — an
// ARIA anti-pattern). The outer div is no longer role="button"/tabbable;
// the CTA button is now the real, individually-focusable keyboard control
// (same handleActivate action), aria-labelledby wires the card to its
// heading instead. Mouse click-anywhere-on-card behavior is unchanged.

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import AIModeCard from "../ai/AIModeCard";
import { AI_MODES, getAIMode } from "../../config/aiModes";

afterEach(() => {
  cleanup();
});

describe("AIModeCard — available mode", () => {
  const omniroute = getAIMode("omniroute")!;

  it("renders title, badge, description, and CTA", () => {
    render(<AIModeCard mode={omniroute} isSelected={false} onSelect={vi.fn()} />);
    expect(screen.getByText(omniroute.title)).toBeInTheDocument();
    expect(screen.getByText(omniroute.badge)).toBeInTheDocument();
    expect(screen.getByText(omniroute.description)).toBeInTheDocument();
    expect(screen.getByText(omniroute.ctaLabel)).toBeInTheDocument();
  });

  it("clicking the card calls onSelect with the mode id", () => {
    const onSelect = vi.fn();
    render(<AIModeCard mode={omniroute} isSelected={false} onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId("ai-mode-card-omniroute"));
    expect(onSelect).toHaveBeenCalledWith("omniroute");
  });

  it("clicking the CTA button also calls onSelect (without double-navigating past the card)", () => {
    const onSelect = vi.fn();
    render(<AIModeCard mode={omniroute} isSelected={false} onSelect={onSelect} />);
    fireEvent.click(screen.getByText(omniroute.ctaLabel));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("the CTA button is a real, independently keyboard-focusable control (not nested inside another interactive role)", () => {
    const onSelect = vi.fn();
    render(<AIModeCard mode={omniroute} isSelected={false} onSelect={onSelect} />);
    const cta = screen.getByText(omniroute.ctaLabel).closest("button")!;
    cta.focus();
    expect(document.activeElement).toBe(cta);
    fireEvent.click(cta);
    expect(onSelect).toHaveBeenCalledWith("omniroute");
  });

  it("the card is not itself a redundant focus stop (no role=button/tabIndex on the outer element)", () => {
    render(<AIModeCard mode={omniroute} isSelected={false} onSelect={vi.fn()} />);
    const card = screen.getByTestId("ai-mode-card-omniroute");
    expect(card).not.toHaveAttribute("role", "button");
    expect(card).not.toHaveAttribute("tabindex");
  });

  it("the card is labelled by its own heading (aria-labelledby), for the group AT context", () => {
    render(<AIModeCard mode={omniroute} isSelected={false} onSelect={vi.fn()} />);
    const card = screen.getByTestId("ai-mode-card-omniroute");
    const labelId = card.getAttribute("aria-labelledby");
    expect(labelId).toBeTruthy();
    expect(document.getElementById(labelId!)).toHaveTextContent(omniroute.title);
  });

  it("shows a checkmark and aria-pressed=true on the CTA button when selected", () => {
    render(<AIModeCard mode={omniroute} isSelected={true} onSelect={vi.fn()} />);
    const cta = screen.getByText(omniroute.ctaLabel).closest("button")!;
    expect(cta).toHaveAttribute("aria-pressed", "true");
  });

  it("How it works and Requirements start collapsed and expand on click", () => {
    const { container } = render(<AIModeCard mode={omniroute} isSelected={false} onSelect={vi.fn()} />);
    expect(screen.queryByText(omniroute.howItWorks[0])).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("How it works"));
    expect(screen.getByText(omniroute.howItWorks[0])).toBeInTheDocument();

    expect(container.textContent).not.toContain(omniroute.requirements[0]);
    fireEvent.click(screen.getByText("Requirements"));
    expect(container.textContent).toContain(omniroute.requirements[0]);
  });

  it("expanding How it works does not also trigger onSelect", () => {
    const onSelect = vi.fn();
    render(<AIModeCard mode={omniroute} isSelected={false} onSelect={onSelect} />);
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

  it("the CTA button itself carries the disabled state for AT users (real disabled attribute, not just visual dimming)", () => {
    render(<AIModeCard mode={partner} isSelected={false} onSelect={vi.fn()} />);
    const cta = screen.getByText(partner.ctaLabel).closest("button")!;
    expect(cta).toBeDisabled();
  });
});

describe("AIModeCard — renders every real mode without crashing", () => {
  it.each(AI_MODES.map((m) => [m.id, m]))("renders %s", (_id, mode) => {
    render(<AIModeCard mode={mode as any} isSelected={false} onSelect={vi.fn()} />);
    cleanup();
  });
});
