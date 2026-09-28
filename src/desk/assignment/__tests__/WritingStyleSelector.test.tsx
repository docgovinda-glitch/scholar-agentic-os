// @vitest-environment jsdom
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import WritingStyleSelector, {
  WRITING_STYLE_OPTIONS,
  TONE_SUGGESTION_CHIPS,
} from "../components/WritingStyleSelector";

describe("WritingStyleSelector — Minimal Dropdown Selector & Advisor Trigger", () => {
  it("renders sleek minimal dropdown with clean header, subtitle, and all 6 style options", () => {
    const handleChange = vi.fn();
    render(
      <WritingStyleSelector
        value={{ preset: "analytical" }}
        onChange={handleChange}
      />
    );

    // 1. Clean Surface Header & Subtitle
    expect(screen.getByText("Writing Tone")).toBeInTheDocument();
    expect(
      screen.getByText("Select an academic voice or match your personal writing style.")
    ).toBeInTheDocument();

    // 2. Minimal Dropdown Select Element
    const select = screen.getByLabelText("Writing Tone") as HTMLSelectElement;
    expect(select).toBeInTheDocument();
    expect(select.value).toBe("analytical");

    // 3. Verify all 6 options are present
    expect(screen.getByRole("option", { name: /Analytical — Breaks down causes, patterns, and connections/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Argumentative — Defends a thesis and addresses counter-arguments/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Critical — Questions assumptions and exposes trade-offs\/limitations/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Expository — Explains concepts clearly without dense jargon/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Natural & Engaging — Human academic voice avoiding AI clichés/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Match My Writing — Clones cadence and structure from uploaded samples/i })).toBeInTheDocument();

    // 4. Subtle Single-line Descriptor
    expect(
      screen.getByText("Breaks down causes, patterns, and connections.")
    ).toBeInTheDocument();

    // 5. Ensure deprecated bulky preview quotes are eliminated
    expect(screen.queryByText(/PREVIEW EXAMPLE/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Local grocers lose market share primarily/i)).not.toBeInTheDocument();
  });

  it("updates value and descriptor when selecting different options from dropdown", () => {
    const handleChange = vi.fn();
    const { rerender } = render(
      <WritingStyleSelector
        value={{ preset: "analytical" }}
        onChange={handleChange}
      />
    );

    const select = screen.getByLabelText("Writing Tone");

    // Select Argumentative
    fireEvent.change(select, { target: { value: "argumentative" } });
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        preset: "argumentative",
        description: "Defends a thesis and addresses counter-arguments.",
      })
    );

    // Rerender with argumentative
    rerender(
      <WritingStyleSelector
        value={{ preset: "argumentative" }}
        onChange={handleChange}
      />
    );
    expect(
      screen.getByText("Defends a thesis and addresses counter-arguments.")
    ).toBeInTheDocument();

    // Select Critical
    fireEvent.change(select, { target: { value: "critical" } });
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        preset: "critical",
        description: "Questions assumptions and exposes trade-offs/limitations.",
      })
    );
  });

  it("dispatches contextual assistant events with 3 tone chips on focus or selection", () => {
    const handleChange = vi.fn();
    const handleFocus = vi.fn();
    const eventSpy = vi.fn();

    window.addEventListener("scholar:copilot-suggested-actions", eventSpy);

    render(
      <WritingStyleSelector
        value={{ preset: "analytical" }}
        onChange={handleChange}
        onFocus={handleFocus}
      />
    );

    const select = screen.getByLabelText("Writing Tone");

    // Focus triggers contextual event and onFocus callback
    fireEvent.focus(select);
    expect(handleFocus).toHaveBeenCalled();
    expect(eventSpy).toHaveBeenCalled();

    const lastEvent = eventSpy.mock.calls[eventSpy.mock.calls.length - 1][0] as CustomEvent;
    expect(lastEvent.detail.actions).toEqual(TONE_SUGGESTION_CHIPS);
    expect(lastEvent.detail.actions).toContain("Which tone best matches my assignment brief?");
    expect(lastEvent.detail.actions).toContain("Compare Analytical vs. Argumentative for this topic");
    expect(lastEvent.detail.actions).toContain("How can I calibrate custom voice cloning?");

    window.removeEventListener("scholar:copilot-suggested-actions", eventSpy);
  });

  it("reveals paste textarea and file upload dropzone when Match My Writing is selected", () => {
    const handleChange = vi.fn();
    const { rerender } = render(
      <WritingStyleSelector
        value={{ preset: "analytical" }}
        onChange={handleChange}
      />
    );

    // Custom voice cloning container shouldn't be visible yet
    expect(screen.queryByPlaceholderText(/Paste an excerpt from an essay or paper/i)).not.toBeInTheDocument();

    // Select Match My Writing (custom)
    const select = screen.getByLabelText("Writing Tone");
    fireEvent.change(select, { target: { value: "custom" } });
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        preset: "custom",
      })
    );

    // Rerender as custom
    rerender(
      <WritingStyleSelector
        value={{ preset: "custom" }}
        onChange={handleChange}
      />
    );

    // Now paste textarea and file upload dropzone are visible
    const textarea = screen.getByPlaceholderText(/Paste an excerpt from an essay or paper/i);
    expect(textarea).toBeInTheDocument();
    expect(screen.getByText(/Drag & drop your sample essay here/i)).toBeInTheDocument();
    expect(screen.getByText(/Option A: Paste Past Writing Sample/i)).toBeInTheDocument();
    expect(screen.getByText(/Option B: Upload Previous Essay/i)).toBeInTheDocument();
  });

  it("handles pasting text and updates customSampleText", () => {
    const handleChange = vi.fn();
    render(
      <WritingStyleSelector
        value={{ preset: "custom" }}
        onChange={handleChange}
      />
    );

    const textarea = screen.getByPlaceholderText(/Paste an excerpt from an essay or paper/i);
    fireEvent.change(textarea, {
      target: {
        value: "The digital transformation of municipal infrastructure requires balanced public-private partnerships.",
      },
    });

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        preset: "custom",
        customSampleText: "The digital transformation of municipal infrastructure requires balanced public-private partnerships.",
      })
    );
  });

  it("handles uploading a sample file (.txt) and reads contents into sample text", async () => {
    const handleChange = vi.fn();
    render(
      <WritingStyleSelector
        value={{ preset: "custom" }}
        onChange={handleChange}
      />
    );

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeInTheDocument();

    const sampleFile = new File(
      ["Our comparative analysis demonstrates consistent correlation across the sample."],
      "sample-paper.txt",
      { type: "text/plain" }
    );

    // Mock text()
    sampleFile.text = vi.fn().mockResolvedValue(
      "Our comparative analysis demonstrates consistent correlation across the sample."
    );

    fireEvent.change(fileInput, { target: { files: [sampleFile] } });

    await vi.waitFor(() => {
      expect(handleChange).toHaveBeenCalledWith(
        expect.objectContaining({
          preset: "custom",
          customFileName: "sample-paper.txt",
          customSampleText: "Our comparative analysis demonstrates consistent correlation across the sample.",
        })
      );
    });
  });
});
