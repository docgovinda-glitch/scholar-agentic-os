// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";
import HumanizerWorkspace from "../HumanizerWorkspace";

vi.mock("../../api", () => ({
  authedJsonFetch: vi.fn(),
}));

import { authedJsonFetch } from "../../api";

describe("HumanizerWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (authedJsonFetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        humanizedText: "Rewritten organic scholarly prose with varied sentence cadence.",
        burstinessScore: 88,
        aiProbability: 8,
        improvements: ["Replaced cliché transition adverbs.", "Balanced sentence cadence."],
      }),
    });
  });

  it("renders side-by-side stylometric studio with AI clichés and humanized prose", () => {
    render(<HumanizerWorkspace projectId="proj-hum-1" />);

    expect(screen.getByText(/Stylometric Tone & Burstiness Calibration/i)).toBeInTheDocument();
    expect(screen.getByText(/Side-by-Side Stylometric Studio/i)).toBeInTheDocument();
    expect(screen.getByText(/Draft Input \(AI \/ Raw Text\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Publication-Grade Humanized Prose/i)).toBeInTheDocument();
    expect(screen.getByText(/Burstiness Meter/i)).toBeInTheDocument();
  });

  it("switches stages when clicking on stage navigation rail", async () => {
    render(<HumanizerWorkspace projectId="proj-hum-1" />);

    // Click 2. Register & Persona
    const personaButton = screen.getByText(/2. Register & Persona/i);
    fireEvent.click(personaButton);
    expect(screen.getByText(/Target Disciplinary Register/i)).toBeInTheDocument();
    expect(screen.getByText(/Calibrated Author Persona/i)).toBeInTheDocument();

    // Click 3. Burstiness & Rhythm
    const rhythmButton = screen.getByText(/3. Burstiness & Rhythm/i);
    fireEvent.click(rhythmButton);
    expect(screen.getByText(/Sentence Length Variation & Cadence Tuning/i)).toBeInTheDocument();
    expect(screen.getByText(/High Dynamic Cadence/i)).toBeInTheDocument();

    // Click 4. Hedging & Modality
    const hedgingButton = screen.getByText(/4. Hedging & Modality/i);
    fireEvent.click(hedgingButton);
    expect(screen.getByText(/Epistemic Hedging & Scholarly Caution/i)).toBeInTheDocument();
    expect(screen.getByText(/Strict Academic Caution/i)).toBeInTheDocument();

    // Click 5. Provenance Gate
    const provenanceButton = screen.getByText(/5. Provenance Gate/i);
    fireEvent.click(provenanceButton);
    expect(screen.getByText(/Zero Hallucination Guarantee/i)).toBeInTheDocument();
  });

  it("executes humanize with authenticated fetch and updates publication prose", async () => {
    render(<HumanizerWorkspace projectId="proj-hum-1" />);

    const humanizeBtn = screen.getByRole("button", { name: /Apply Human Stylometrics/i });
    fireEvent.click(humanizeBtn);

    await waitFor(() => {
      expect(authedJsonFetch).toHaveBeenCalledWith(
        "/api/projects/proj-hum-1/humanizer/humanize",
        "POST",
        expect.objectContaining({
          text: expect.any(String),
          register: expect.any(String),
          persona: expect.any(String),
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/Rewritten organic scholarly prose/i)).toBeInTheDocument();
    });
  });
});
