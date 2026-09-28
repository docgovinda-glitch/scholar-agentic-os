// @vitest-environment jsdom
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import WritingStyleSelector, { WRITING_STYLE_OPTIONS } from "../components/WritingStyleSelector";
import type { WritingStyleConfig } from "../types";

describe("WritingStyleSelector — 6 Academic Writing Styles & Custom Voice Cloning", () => {
  it("renders all 6 distinct academic writing style cards with descriptions and preview examples", () => {
    const handleChange = vi.fn();
    render(
      <WritingStyleSelector
        value={{ preset: "analytical" }}
        onChange={handleChange}
      />
    );

    // 1. Analytical
    expect(screen.getByText("Analytical")).toBeInTheDocument();
    expect(
      screen.getByText(/Breaks down causes, patterns, and connections between concepts/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Local grocers lose market share primarily because digital platforms eliminate travel and checkout friction for suburban households/i)
    ).toBeInTheDocument();

    // 2. Argumentative
    expect(screen.getByText("Argumentative")).toBeInTheDocument();
    expect(
      screen.getByText(/Takes a clear stance, defends a thesis, and addresses counter-arguments/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/While physical stores emphasize personalized service, convenience and price discounts consistently override customer loyalty/i)
    ).toBeInTheDocument();

    // 3. Critical
    expect(screen.getByText("Critical")).toBeInTheDocument();
    expect(
      screen.getByText(/Questions assumptions, weighs trade-offs, and exposes flaws or limitations/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Reports celebrating delivery convenience overlook hidden trade-offs/i)
    ).toBeInTheDocument();

    // 4. Expository
    expect(screen.getByText("Expository")).toBeInTheDocument();
    expect(
      screen.getByText(/Explains concepts clearly, directly, and authoritatively without dense jargon/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Online platforms dominate grocery retail through bulk purchasing, centralized warehousing, and automated dispatch systems/i)
    ).toBeInTheDocument();

    // 5. Natural & Engaging (Human Voice)
    expect(screen.getByText(/Natural & Engaging \(Human Voice\)/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Authentic, conversational academic rhythm/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Most shoppers leave local grocers for a simple reason/i)
    ).toBeInTheDocument();

    // 6. Match My Writing (Custom Voice)
    expect(screen.getByText(/Match My Writing \(Custom Voice\)/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Clones your natural sentence structure, pacing, and vocabulary level/i)
    ).toBeInTheDocument();
  });

  it("marks the active card as selected and calls onChange when selecting different styles", () => {
    const handleChange = vi.fn();
    const { rerender } = render(
      <WritingStyleSelector
        value={{ preset: "analytical" }}
        onChange={handleChange}
      />
    );

    // Click Argumentative
    const argCard = screen.getByRole("button", { name: /Argumentative/i });
    fireEvent.click(argCard);
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        preset: "argumentative",
      })
    );

    // Rerender with Critical
    rerender(
      <WritingStyleSelector
        value={{ preset: "critical" }}
        onChange={handleChange}
      />
    );

    // Click Natural & Engaging
    const naturalCard = screen.getByRole("button", { name: /Natural & Engaging/i });
    fireEvent.click(naturalCard);
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        preset: "natural",
      })
    );
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

    // Select Match My Writing
    const customCard = screen.getByRole("button", { name: /Match My Writing/i });
    fireEvent.click(customCard);
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
      ["In analyzing renewable energy subsidies, market distortion remains minimal compared to systemic environmental externalities."],
      "past_essay_sample.txt",
      { type: "text/plain" }
    );

    Object.defineProperty(fileInput, "files", {
      value: [sampleFile],
      configurable: true,
    });
    fireEvent.change(fileInput, { target: { files: [sampleFile] } });

    await waitFor(() => {
      expect(handleChange).toHaveBeenCalledWith(
        expect.objectContaining({
          preset: "custom",
          customFileName: "past_essay_sample.txt",
          customSampleText: expect.stringContaining("In analyzing renewable energy subsidies"),
        })
      );
    });
  });
});
