// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";
import PresentationWorkspace from "../PresentationWorkspace";

describe("PresentationWorkspace", () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, mutatedSlide: null }),
    });
  });

  it("renders 4-step guided studio workflow with 01 Scaffolding, 02 Themes, 03 Studio, and 04 Delivery", () => {
    render(<PresentationWorkspace projectId="proj-pres-1" />);

    expect(screen.getByText(/Presentation Studio/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /01 Scaffolding/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /02 Themes & Templates/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /03 Canvas Studio/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /04 Delivery & Export/i })).toBeInTheDocument();
    expect(screen.getByText(/Saved to PostgreSQL/i)).toBeInTheDocument();
  });

  it("navigates between steps via stepper buttons", async () => {
    render(<PresentationWorkspace projectId="proj-pres-1" />);

    // Switch to Step 01 Scaffolding
    const step1Btn = screen.getByRole("button", { name: /01 Scaffolding/i });
    fireEvent.click(step1Btn);
    expect(screen.getByTestId("step-01-scaffolding")).toBeInTheDocument();
    expect(screen.getByText(/Architect Your Presentation Narrative/i)).toBeInTheDocument();

    // Switch to Step 02 Themes
    const step2Btn = screen.getByRole("button", { name: /02 Themes & Templates/i });
    fireEvent.click(step2Btn);
    expect(screen.getByTestId("step-02-theme-template")).toBeInTheDocument();
    expect(screen.getByText(/Select Design Theme or Bring Your Own Template/i)).toBeInTheDocument();

    // Switch to Step 04 Delivery
    const step4Btn = screen.getByRole("button", { name: /04 Delivery & Export/i });
    fireEvent.click(step4Btn);
    expect(screen.getByTestId("step-04-delivery")).toBeInTheDocument();
    expect(screen.getByText(/Step 04 · Delivery & Presentation/i)).toBeInTheDocument();

    // Return to Step 03 Studio
    const step3Btn = screen.getByRole("button", { name: /03 Canvas Studio/i });
    fireEvent.click(step3Btn);
    expect(screen.getByTestId("step-03-studio-canvas")).toBeInTheDocument();
  });

  it("Step 01: generates 5-beat architecture from topic prompt", () => {
    render(<PresentationWorkspace projectId="proj-pres-1" />);

    // Go to scaffolding
    fireEvent.click(screen.getByRole("button", { name: /01 Scaffolding/i }));

    const input = screen.getByPlaceholderText(/e\.g\. Quantum Computing/i);
    fireEvent.change(input, {
      target: { value: "Quantum Computing & Cryptographic Verification" },
    });

    const genBtn = screen.getByRole("button", { name: /Generate 5-Beat Architecture/i });
    fireEvent.click(genBtn);

    expect(screen.getByText(/Generated Narrative Architecture/i)).toBeInTheDocument();
    expect(screen.getByText(/Beat 1/i)).toBeInTheDocument();
    expect(screen.getByText(/Beat 5/i)).toBeInTheDocument();
  });

  it("Step 02: supports preset theme selection and BYOT contrast validation", () => {
    render(<PresentationWorkspace projectId="proj-pres-1" />);

    // Go to themes
    fireEvent.click(screen.getByRole("button", { name: /02 Themes & Templates/i }));

    // Click BYOT tab
    const byotTab = screen.getByRole("button", { name: /Bring Your Own Template/i });
    fireEvent.click(byotTab);

    expect(screen.getByText(/10% Accent Signal Color/i)).toBeInTheDocument();
    expect(screen.getByText(/WCAG AA Pass/i)).toBeInTheDocument();
  });

  it("Step 03: supports WYSIWYG text editing, 6x6 bullet alerts, and layout switching", () => {
    render(<PresentationWorkspace projectId="proj-pres-1" />);

    // Defaults to studio
    expect(screen.getByTestId("step-03-studio-canvas")).toBeInTheDocument();
    expect(screen.getByTestId("wysiwyg-slide-card")).toBeInTheDocument();

    // Switch layout to Big Metric Focus
    const metricLayoutBtn = screen.getByRole("button", { name: /Big Metric Focus/i });
    fireEvent.click(metricLayoutBtn);

    expect(screen.getByDisplayValue("4.2x")).toBeInTheDocument();

    // Switch layout to 2-Column Comparative
    const colLayoutBtn = screen.getByRole("button", { name: /2-Column Comparative/i });
    fireEvent.click(colLayoutBtn);

    expect(screen.getByDisplayValue(/Baseline Framework|Baseline Heuristic Model/i)).toBeInTheDocument();
  });

  it("Step 04: toggles between Stage View and Leave-Behind View with methodology provenance", () => {
    render(<PresentationWorkspace projectId="proj-pres-1" />);

    // Go to delivery
    fireEvent.click(screen.getByRole("button", { name: /04 Delivery & Export/i }));

    // Initial Stage View: minimal footer
    expect(screen.queryByTestId("leave-behind-footer")).not.toBeInTheDocument();

    // Click Leave-Behind View
    const leaveBehindBtn = screen.getByRole("button", { name: /Leave-Behind View/i });
    fireEvent.click(leaveBehindBtn);

    // Leave-Behind mode exposes provenance
    expect(screen.getByTestId("leave-behind-footer")).toBeInTheDocument();
    expect(screen.getByText(/Provenance:/i)).toBeInTheDocument();
  });

  it("triggers 500ms debounced autosave to PostgreSQL REST API on slide mutation", async () => {
    vi.useFakeTimers();

    render(<PresentationWorkspace projectId="proj-pres-deb" />);

    // In Studio canvas, edit headline
    const headlineTextarea = screen.getByPlaceholderText(/Action Headline asserting singular conclusion/i);
    fireEvent.change(headlineTextarea, {
      target: { value: "Empirical Proof: 99.8% Grounding Precision Achieved" },
    });

    expect(screen.getByText(/Autosaving\.\.\./i)).toBeInTheDocument();

    // Advance timer by 500ms
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/presentations/"),
      expect.objectContaining({ method: "PUT" })
    );

    vi.useRealTimers();
  });

  it("opens LiveSlidePlayer when Present Fullscreen is clicked and closes on Exit", async () => {
    render(<PresentationWorkspace projectId="proj-pres-1" />);

    const presentBtn = screen.getByTestId("present-fullscreen-btn");
    fireEvent.click(presentBtn);

    expect(await screen.findByTestId("live-slide-player")).toBeInTheDocument();
    expect(screen.getByText(/Audience Mode/i)).toBeInTheDocument();

    const exitBtn = screen.getByTitle(/Exit Presentation/i);
    fireEvent.click(exitBtn);

    expect(screen.queryByTestId("live-slide-player")).not.toBeInTheDocument();
  });

  it("converts initialCourseworkText markdown into slides with action headlines and metrics", () => {
    const markdown = `# Empirical Research On Academic Writing

## Context & Problem
Generative AI tools without cryptographic provenance fail 84% of peer-review citation audits.
- Severe hallucination risks across scholarly publications
- Surface fluency masks fabricated citations

## Empirical Results
Multi-agent verification delivers 100% citation accuracy across 5,000 tested references.`;

    render(
      <PresentationWorkspace
        projectId="proj-pres-cw"
        initialCourseworkText={markdown}
      />
    );

    // Check action headline
    expect(screen.getAllByText(/Generative AI tools without cryptographic provenance fail 84%/i).length).toBeGreaterThan(0);
    // Check metric
    expect(screen.getByDisplayValue("84%")).toBeInTheDocument();
  });

  it("renders clean empty state with zero ghost metrics or phantom references when empty coursework text is provided", () => {
    render(
      <PresentationWorkspace
        projectId="proj-pres-empty"
        initialCourseworkText=""
      />
    );

    expect(screen.getByTestId("slide-card-empty-state")).toBeInTheDocument();
    expect(screen.getByText(/No Coursework Content Loaded/i)).toBeInTheDocument();
    expect(screen.getByText(/No active slides loaded · Ingest coursework draft/i)).toBeInTheDocument();
    expect(screen.queryByTestId("wysiwyg-slide-card")).not.toBeInTheDocument();
  });

  it("converts dynamic coursework draft text via extraction bridge without page reload", () => {
    render(<PresentationWorkspace projectId="proj-pres-dyn" initialCourseworkText="" />);

    expect(screen.getByTestId("slide-card-empty-state")).toBeInTheDocument();

    const textarea = screen.getByLabelText("Coursework Markdown Input");
    fireEvent.change(textarea, {
      target: {
        value: `## Breakthrough Synthesis\nDeterministic agent consensus achieves 99.8% precision with sub-second latency.`,
      },
    });

    const extractBtn = screen.getByRole("button", { name: /Extract Slides from Academic Text/i });
    fireEvent.click(extractBtn);

    expect(screen.queryByTestId("slide-card-empty-state")).not.toBeInTheDocument();
    expect(screen.getByTestId("step-03-studio-canvas")).toBeInTheDocument();
    expect(screen.getByDisplayValue("99.8%")).toBeInTheDocument();
  });
});
