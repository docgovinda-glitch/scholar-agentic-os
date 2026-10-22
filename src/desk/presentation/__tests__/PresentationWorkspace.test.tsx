// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders 4-step guided studio workflow with 01 Understand, 02 Design, 03 Edit Slides, and 04 Present with clean auto-save and zero developer jargon", () => {
    render(<PresentationWorkspace projectId="proj-pres-1" />);

    expect(screen.getAllByText(/Presentation Studio/i).length).toBeGreaterThan(0);

    expect(screen.getByRole("button", { name: /01 Understand/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /02 Design/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /03 Edit Slides/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /04 Present/i })).toBeInTheDocument();
    expect(screen.getByText(/All changes saved|Saved/i)).toBeInTheDocument();
    expect(screen.queryByText(/PostgreSQL/i)).not.toBeInTheDocument();
    const defenseJargonRegex = new RegExp(["Defense", "Tools"].join(" "), "i");
    expect(screen.queryByText(defenseJargonRegex)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Defense/i })).not.toBeInTheDocument();
  });

  it("navigates between steps via clean stepper buttons", async () => {
    render(<PresentationWorkspace projectId="proj-pres-1" initialStep="studio" />);

    // Switch to Step 01 Understand
    const step1Btn = screen.getByRole("button", { name: /01 Understand/i });
    fireEvent.click(step1Btn);
    expect(screen.getByTestId("step-01-understand")).toBeInTheDocument();
    expect(screen.getByText(/Understand Your Presentation/i)).toBeInTheDocument();

    // Switch to Step 02 Design
    const step2Btn = screen.getByRole("button", { name: /02 Design/i });
    fireEvent.click(step2Btn);
    expect(screen.getByText("Choose Presentation Design")).toBeInTheDocument();

    // Switch to Step 04 Present
    const step4Btn = screen.getByRole("button", { name: /04 Present/i });
    fireEvent.click(step4Btn);
    expect(screen.getByTestId("step-04-delivery")).toBeInTheDocument();
    expect(screen.getByText(/Step 04 · Delivery & Presentation/i)).toBeInTheDocument();

    // Return to Step 03 Edit Slides
    const step3Btn = screen.getByRole("button", { name: /03 Edit Slides/i });
    fireEvent.click(step3Btn);
    expect(screen.getByTestId("step-03-studio-canvas")).toBeInTheDocument();
  });

  it("Step 01: starts clean with zero mock slides and generates outline on demand", () => {
    render(<PresentationWorkspace projectId="proj-pres-1" />);

    // Starts on 01 Understand
    expect(screen.getByTestId("step-01-understand")).toBeInTheDocument();
    expect(screen.queryByTestId("generated-outline-section")).not.toBeInTheDocument();

    const input = screen.getByPlaceholderText(/presentation topic|key question/i);
    fireEvent.change(input, {
      target: { value: "Why Zappos Pays New Hires to Quit" },
    });

    const genBtn = screen.getByRole("button", { name: /Create Slides Outline/i });
    fireEvent.click(genBtn);

    expect(screen.getByText(/Generated Presentation Outline/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Why Zappos Pays New Hires to Quit/i).length).toBeGreaterThan(0);
  });

  it("Step 02: displays exactly 4 curated theme cards and custom accent picker with zero cloner or 20+ filter chips", () => {
    render(<PresentationWorkspace projectId="proj-pres-1" />);

    // Go to design themes
    fireEvent.click(screen.getByRole("button", { name: /02 Design/i }));

    // 4 Clean theme cards
    expect(screen.getByTestId("theme-card-sand-academic")).toBeInTheDocument();
    expect(screen.getByTestId("theme-card-minimal-clean")).toBeInTheDocument();
    expect(screen.getByTestId("theme-card-editorial-warm")).toBeInTheDocument();
    expect(screen.getByTestId("theme-card-deep-midnight")).toBeInTheDocument();

    // Custom accent color picker
    expect(screen.getByTestId("custom-accent-picker")).toBeInTheDocument();
    expect(screen.getByText(/WCAG AA/i)).toBeInTheDocument();

    // Verify bloat is removed
    expect(screen.queryByText(/22 Curated Presets/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/AI Theme Maker/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Freestyle \(Random\)/i)).not.toBeInTheDocument();
  });

  it("Step 03: supports WYSIWYG text editing, 6x6 bullet alerts, layout switching, and Split Image + Text layout", () => {
    render(<PresentationWorkspace projectId="proj-pres-1" initialStep="studio" />);

    // Defaults to studio
    expect(screen.getByTestId("step-03-studio-canvas")).toBeInTheDocument();
    expect(screen.getByTestId("wysiwyg-slide-card")).toBeInTheDocument();

    // Switch layout to Big Metric Focus
    const metricLayoutBtn = screen.getByRole("button", { name: /Big Metric Focus/i });
    fireEvent.click(metricLayoutBtn);
    expect(screen.getByDisplayValue("4.2x")).toBeInTheDocument();

    // Switch layout to Split Image + Text
    const splitLayoutBtn = screen.getByRole("button", { name: /Split Image \+ Text/i });
    fireEvent.click(splitLayoutBtn);
    expect(screen.getByTestId("split-image-text-container")).toBeInTheDocument();
    expect(screen.getByText(/Key Points/i)).toBeInTheDocument();

    // Switch layout to 2-Column Comparison
    const colLayoutBtn = screen.getByRole("button", { name: /2-Column Comparison/i });
    fireEvent.click(colLayoutBtn);
    expect(screen.getByDisplayValue(/Baseline Framework|Baseline Heuristic Model/i)).toBeInTheDocument();
  });

  it("Step 04: toggles between Stage View and Leave-Behind View with methodology provenance", () => {
    render(<PresentationWorkspace projectId="proj-pres-1" initialStep="studio" />);

    // Go to delivery
    fireEvent.click(screen.getByRole("button", { name: /04 Present/i }));

    // Initial Stage View: minimal footer
    expect(screen.queryByTestId("leave-behind-footer")).not.toBeInTheDocument();

    // Click Leave-Behind View
    const leaveBehindBtn = screen.getByRole("button", { name: /Leave-Behind View/i });
    fireEvent.click(leaveBehindBtn);

    // Leave-Behind mode exposes provenance
    expect(screen.getByTestId("leave-behind-footer")).toBeInTheDocument();
    expect(screen.getByText(/Provenance:/i)).toBeInTheDocument();
  });

  it("triggers 500ms debounced autosave with clean indicator and zero PostgreSQL leakage", async () => {
    vi.useFakeTimers();

    render(<PresentationWorkspace projectId="proj-pres-deb" initialStep="studio" />);

    // In Studio canvas, edit headline
    const headlineTextarea = screen.getByPlaceholderText(/Action Headline asserting singular conclusion/i);
    fireEvent.change(headlineTextarea, {
      target: { value: "Empirical Proof: 99.8% Grounding Precision Achieved" },
    });

    expect(screen.getByText(/Saving changes\.\.\./i)).toBeInTheDocument();
    expect(screen.queryByText(/PostgreSQL/i)).not.toBeInTheDocument();

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

  it("does not render Present Fullscreen in header during Steps 01, 02, and 03, and mounts it exclusively in Step 04", () => {
    render(<PresentationWorkspace projectId="proj-pres-clean-header" initialStep="studio" />);

    // In Step 03, header has no Present Fullscreen button
    expect(screen.queryByTestId("present-fullscreen-btn")).not.toBeInTheDocument();

    // Step 01 Understand: no Present Fullscreen button
    fireEvent.click(screen.getByRole("button", { name: /01 Understand/i }));
    expect(screen.queryByTestId("present-fullscreen-btn")).not.toBeInTheDocument();

    // Step 02 Design: no Present Fullscreen button
    fireEvent.click(screen.getByRole("button", { name: /02 Design/i }));
    expect(screen.queryByTestId("present-fullscreen-btn")).not.toBeInTheDocument();

    // Step 04 Present: Present Fullscreen button is properly mounted
    fireEvent.click(screen.getByRole("button", { name: /04 Present/i }));
    expect(screen.getByTestId("present-fullscreen-btn")).toBeInTheDocument();
    expect(screen.getByTestId("present-fullscreen-btn")).toHaveTextContent(/Start Presentation \(F\)/i);
  });

  it("opens LiveSlidePlayer when Present Fullscreen is clicked in Step 04 and closes on Exit", async () => {
    render(<PresentationWorkspace projectId="proj-pres-1" initialStep="delivery" />);

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

  it("mounts collapsible right-side 'Ask Scholar' drawer and toggles smoothly via header button", async () => {
    render(<PresentationWorkspace projectId="proj-pres-drawer" initialStep="studio" />);

    // Initially closed
    expect(screen.queryByTestId("ask-scholar-drawer")).not.toBeInTheDocument();

    // Toggle open
    const toggleBtn = screen.getByTestId("toggle-ask-scholar-btn");
    fireEvent.click(toggleBtn);

    expect(screen.getByTestId("ask-scholar-drawer")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ask Scholar" })).toBeInTheDocument();
    expect(screen.getByText(/Slide & Outline Advisor|Presentation Advisor/i)).toBeInTheDocument();

    // Suggested actions appear in drawer
    expect(screen.getByText(/Improve action headlines|Suggest stronger action headlines/i)).toBeInTheDocument();
    expect(screen.getByText(/Audit 6x6 bullet rules|Audit slides for 6x6 bullet rule/i)).toBeInTheDocument();

    // Toggle close via drawer chevron button
    const closeBtn = screen.getByLabelText("Close Ask Scholar drawer");
    fireEvent.click(closeBtn);

    expect(screen.queryByTestId("ask-scholar-drawer")).not.toBeInTheDocument();
  });

  it("integrates ScholarSidebar with active Presentation Studio pill and collapsible toggle", () => {
    render(<PresentationWorkspace projectId="proj-pres-sidebar" />);

    // ScholarSidebar is mounted
    const sidebar = screen.getByTestId("scholar-sidebar");
    expect(sidebar).toBeInTheDocument();
    expect(screen.getByText("Scholar Core")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /New Project/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Knowledge Vault/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Manage AI Access/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Search projects\.\.\./i)).toBeInTheDocument();
    expect(screen.getByTestId("user-profile-card")).toBeInTheDocument();

    // Presentation Studio item has active highlight
    const presStudioNavBtn = screen.getByRole("button", { name: "Presentation Studio" });
    expect(presStudioNavBtn).toBeInTheDocument();
    expect(presStudioNavBtn.className).toContain("font-bold");

    // Collapse toggle button («) collapses sidebar
    const collapseBtn = screen.getByTestId("collapse-sidebar-btn");
    fireEvent.click(collapseBtn);
    expect(sidebar.className).toContain("w-0");

    // In header, expand button (») appears
    const expandBtn = screen.getByTestId("expand-sidebar-btn");
    expect(expandBtn).toBeInTheDocument();

    // Clicking expand restores sidebar
    fireEvent.click(expandBtn);
    expect(sidebar.className).toContain("w-[260px]");
  });

  it("replaces abrupt header close cross with Apple/Airbnb back button and invokes onClose", () => {
    const handleClose = vi.fn();
    render(<PresentationWorkspace projectId="proj-pres-back" onClose={handleClose} />);

    // Zero raw close cross (✕) in the header
    expect(screen.queryByTitle("Close Presentation Studio")).not.toBeInTheDocument();
    expect(screen.queryByText("✕")).not.toBeInTheDocument();

    // Left-anchored Apple/Airbnb back button
    const backBtn = screen.getByRole("button", { name: /Back to Workspace/i });
    expect(backBtn).toBeInTheDocument();
    expect(backBtn).toHaveTextContent("Workspace");

    fireEvent.click(backBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("displays the OT-22 learned ML Style Compliance badge and exports quantitative constraints", () => {
    render(<PresentationWorkspace projectId="proj-pres-style" />);

    // Renders the learned style badge
    const badge = screen.getByTestId("presentation-style-badge");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("OT-22 Style:");
    expect(badge).toHaveTextContent("Conversational Academic");
    expect(badge).toHaveTextContent("6x6 Density");
  });

  it("hydrates presentation deck and version tracking from getProject and displays version badge", async () => {
    const mockDeck = {
      id: "deck-hydrated-42",
      title: "Neural Synthesizer Architecture",
      topic: "Neural Synthesizer Architecture",
      sourceModule: "presentation-studio",
      framework: "Standard-Narrative",
      slides: [
        {
          id: "slide-h-1",
          order: 1,
          actionHeadline: "Empirical Lift: 4.2x Faster Synthesis",
          summary: "Core analytical takeaway",
          layoutType: "metric-focus",
          blocks: [
            {
              type: "action-header",
              headline: "Empirical Lift: 4.2x Faster Synthesis",
            },
            {
              type: "metric-callout",
              value: "4.2x",
              metric: "4.2x",
              label: "Speedup",
            },
          ],
          speakerNotes: "Speaker rehearsal notes",
        },
      ],
      activeSlideIndex: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/presentation/deck")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true, deck: mockDeck, version: 4 }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          projectId: "proj-hydrated-1",
          version: 4,
          title: "Neural Synthesizer Architecture",
          answers: {
            presentationDeck: mockDeck,
          },
        }),
      });
    });

    render(<PresentationWorkspace projectId="proj-hydrated-1" initialStep="studio" />);

    expect(await screen.findByDisplayValue("Neural Synthesizer Architecture")).toBeInTheDocument();
    expect(screen.getByText("v4")).toBeInTheDocument();
    expect(screen.getAllByText(/Empirical Lift: 4\.2x Faster Synthesis/i).length).toBeGreaterThan(0);
  });

  it("opens Audience Q&A Simulator modal, renders referee questions, and reveals model defense arguments", async () => {
    render(<PresentationWorkspace projectId="proj-qa-test" initialStep="studio" />);

    // Open Q&A Simulator
    const qaBtn = screen.getByTestId("open-qa-simulator-btn");
    fireEvent.click(qaBtn);

    expect(screen.getByTestId("audience-qa-simulator-modal")).toBeInTheDocument();
    expect(screen.getByText(/Audience Q&A & Defense Simulator/i)).toBeInTheDocument();
    expect(screen.getByText(/Referee Rigor/i)).toBeInTheDocument();

    // Verify initial referee question is displayed
    expect(screen.getByText(/Methodological Referee/i)).toBeInTheDocument();
    expect(screen.getByTestId("qa-question-card-0")).toBeInTheDocument();

    // Reveal model rebuttal arguments
    const revealBtn = screen.getAllByRole("button", { name: /Reveal Model Defense & Rebuttal Points/i })[0];
    fireEvent.click(revealBtn);

    expect(screen.getByText(/Candidate Model Response:/i)).toBeInTheDocument();
    expect(screen.getByText(/Key Grounded Evidence Points:/i)).toBeInTheDocument();

    // Close the simulator
    const doneBtn = screen.getByRole("button", { name: /Done Rehearsing/i });
    fireEvent.click(doneBtn);

    expect(screen.queryByTestId("audience-qa-simulator-modal")).not.toBeInTheDocument();
  });
});

