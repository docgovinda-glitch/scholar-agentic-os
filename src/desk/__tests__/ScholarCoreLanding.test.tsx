// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ScholarCoreLanding from "../ScholarCoreLanding";

describe("ScholarCoreLanding", () => {
  it("renders 24 Specialized Academic Formats above the fold", () => {
    render(
      <MemoryRouter>
        <ScholarCoreLanding />
      </MemoryRouter>
    );

    expect(screen.getByText(/24 SPECIALIZED ACADEMIC FORMATS/i)).toBeInTheDocument();
    expect(screen.getByText(/1\. Short-Form Writeup/i)).toBeInTheDocument();
    expect(screen.getByText(/2\. Long-Form Writing/i)).toBeInTheDocument();
    expect(screen.getByText(/3\. Publications/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Assignment/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Initialize OT-01 →/i)).toBeInTheDocument();
  });

  it("switches format categories and updates format cards", () => {
    render(
      <MemoryRouter>
        <ScholarCoreLanding />
      </MemoryRouter>
    );

    const pubTab = screen.getByText(/3\. Publications/i);
    fireEvent.click(pubTab);

    expect(screen.getByText(/Empirical Journal Article/i)).toBeInTheDocument();
    expect(screen.getByText(/Initialize OT-10 →/i)).toBeInTheDocument();
  });

  it("opens the embedded auth modal when clicking an initialize button", () => {
    render(
      <MemoryRouter>
        <ScholarCoreLanding />
      </MemoryRouter>
    );

    const initBtn = screen.getByText(/Initialize OT-01 →/i);
    fireEvent.click(initBtn);

    // Modal opens with Scholar Core branding and auth form
    expect(screen.getAllByRole("heading", { name: /Scholar Core/i }).length).toBeGreaterThan(0);
    expect(screen.getByPlaceholderText(/name@institution\.edu/i)).toBeInTheDocument();
  });

  it("allows interactive citation verification in live demo", () => {
    render(
      <MemoryRouter>
        <ScholarCoreLanding />
      </MemoryRouter>
    );

    const citationBtn = screen.getByText(/\[1\] Nature Biotech 2024/i);
    fireEvent.click(citationBtn);

    expect(screen.getByText(/Knowledge Vault Provenance Inspector/i)).toBeInTheDocument();
    expect(screen.getByText(/99\.4% Provenance Match/i)).toBeInTheDocument();
    expect(screen.getByText(/ZERO Hallucination Confirmed/i)).toBeInTheDocument();
  });
});
