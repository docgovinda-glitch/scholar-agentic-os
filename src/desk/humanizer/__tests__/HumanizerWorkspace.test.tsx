// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";
import HumanizerWorkspace from "../HumanizerWorkspace";

describe("HumanizerWorkspace", () => {
  it("renders side-by-side stylometric studio with AI clichés and humanized prose", () => {
    render(<HumanizerWorkspace projectId="proj-hum-1" />);

    expect(screen.getByText(/Stylometric Tone & Burstiness Calibration/i)).toBeInTheDocument();
    expect(screen.getByText(/Side-by-Side Stylometric Studio/i)).toBeInTheDocument();
    expect(screen.getByText(/Draft Input \(AI \/ Raw Text\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Publication-Grade Humanized Prose/i)).toBeInTheDocument();
  });
});
