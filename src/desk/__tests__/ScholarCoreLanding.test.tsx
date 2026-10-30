// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ScholarCoreLanding from "../ScholarCoreLanding";

describe("ScholarCoreLanding", () => {
  it("renders 5 Dedicated Academic Workspaces above the fold", () => {
    render(
      <MemoryRouter>
        <ScholarCoreLanding />
      </MemoryRouter>
    );

    expect(screen.getByText(/5 DEDICATED ACADEMIC WORKSPACES/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Assignment/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Journal Article/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Thesis \/ Dissertation/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Presentation/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Initialize Assignment →/i)).toBeInTheDocument();
  });

  it("displays exact services across all 5 curated workspace cards", () => {
    render(
      <MemoryRouter>
        <ScholarCoreLanding />
      </MemoryRouter>
    );

    expect(screen.getByText(/Initialize Journal Article →/i)).toBeInTheDocument();
    expect(screen.getByText(/Initialize Thesis \/ Dissertation →/i)).toBeInTheDocument();
    expect(screen.getByText(/Initialize Presentation →/i)).toBeInTheDocument();
  });

  it("opens the embedded auth modal when clicking an initialize button", () => {
    render(
      <MemoryRouter>
        <ScholarCoreLanding />
      </MemoryRouter>
    );

    const initBtn = screen.getByText(/Initialize Assignment →/i);
    fireEvent.click(initBtn);

    // Modal opens in signup mode with Scholar Core branding and previously engineered SignUpScreen
    expect(screen.getByRole("heading", { name: /Create your account/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Full name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Email/i)).toBeInTheDocument();
  });

  it("allows interactive citation verification in the demo, labelled as an illustration", () => {
    render(
      <MemoryRouter>
        <ScholarCoreLanding />
      </MemoryRouter>
    );

    expect(screen.getByText(/Illustrative example: sample text, not real sources/i)).toBeInTheDocument();
    const citationBtn = screen.getByText(/\[1\] Source A 2024/i);
    fireEvent.click(citationBtn);

    expect(screen.getByText(/Knowledge Vault Provenance Inspector/i)).toBeInTheDocument();
    expect(screen.getByText(/Exact quote found/i)).toBeInTheDocument();
    // No real journal is credited with an invented quote, and no unprovable claims.
    expect(screen.queryByText(/Nature Biotech/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/cryptographic/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/ZERO Hallucination/i)).not.toBeInTheDocument();
  });
});
