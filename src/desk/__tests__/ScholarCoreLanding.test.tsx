// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ScholarCoreLanding from "../ScholarCoreLanding";

describe("ScholarCoreLanding", () => {
  it("renders 6 Dedicated Academic Workspaces above the fold", () => {
    render(
      <MemoryRouter>
        <ScholarCoreLanding />
      </MemoryRouter>
    );

    expect(screen.getByText(/6 DEDICATED ACADEMIC WORKSPACES/i)).toBeInTheDocument();
    expect(screen.getByText(/1\. Assignment/i)).toBeInTheDocument();
    expect(screen.getByText(/2\. Journal Article/i)).toBeInTheDocument();
    expect(screen.getByText(/3\. Thesis \/ Dissertation/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Assignment/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Initialize Academic Assignment →/i)).toBeInTheDocument();
  });

  it("switches format categories and updates format cards", () => {
    render(
      <MemoryRouter>
        <ScholarCoreLanding />
      </MemoryRouter>
    );

    const pubTab = screen.getByText(/2\. Journal Article/i);
    fireEvent.click(pubTab);

    expect(screen.getAllByText(/Journal Article/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Initialize Journal Article →/i)).toBeInTheDocument();
  });

  it("opens the embedded auth modal when clicking an initialize button", () => {
    render(
      <MemoryRouter>
        <ScholarCoreLanding />
      </MemoryRouter>
    );

    const initBtn = screen.getByText(/Initialize Academic Assignment →/i);
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
