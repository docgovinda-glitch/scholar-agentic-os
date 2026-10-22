// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import CourseworkModeToggle from "../CourseworkModeToggle";

describe("CourseworkModeToggle", () => {
  it("renders both Minimal Mode and Detailed Mode cards with neutral zinc styling", () => {
    const handleChange = vi.fn();
    render(<CourseworkModeToggle mode="minimal" onChange={handleChange} />);

    expect(screen.getByRole("radiogroup", { name: /Coursework Orchestration Mode/i })).toBeInTheDocument();
    expect(screen.getByText("Minimal Mode")).toBeInTheDocument();
    expect(screen.getByText("Detailed Mode")).toBeInTheDocument();

    const minimalRadio = screen.getByRole("radio", { name: /Minimal Mode/i });
    const detailedRadio = screen.getByRole("radio", { name: /Detailed Mode/i });

    expect(minimalRadio).toHaveAttribute("aria-checked", "true");
    expect(detailedRadio).toHaveAttribute("aria-checked", "false");

    // Verify neutral zinc borders and zero pure black
    expect(minimalRadio.className).toContain("border-zinc-");
    expect(minimalRadio.className).not.toContain("border-black");
    expect(minimalRadio.className).not.toContain("bg-black");
  });

  it("calls onChange when selecting Detailed Mode", () => {
    const handleChange = vi.fn();
    render(<CourseworkModeToggle mode="minimal" onChange={handleChange} />);

    const detailedRadio = screen.getByRole("radio", { name: /Detailed Mode/i });
    fireEvent.click(detailedRadio);

    expect(handleChange).toHaveBeenCalledWith("detailed");
  });

  it("calls onChange when selecting Minimal Mode", () => {
    const handleChange = vi.fn();
    render(<CourseworkModeToggle mode="detailed" onChange={handleChange} />);

    const minimalRadio = screen.getByRole("radio", { name: /Minimal Mode/i });
    fireEvent.click(minimalRadio);

    expect(handleChange).toHaveBeenCalledWith("minimal");
  });

  it("respects disabled state and prevents selection", () => {
    const handleChange = vi.fn();
    render(<CourseworkModeToggle mode="minimal" onChange={handleChange} disabled={true} />);

    const detailedRadio = screen.getByRole("radio", { name: /Detailed Mode/i });
    expect(detailedRadio).toBeDisabled();

    fireEvent.click(detailedRadio);
    expect(handleChange).not.toHaveBeenCalled();
  });
});
