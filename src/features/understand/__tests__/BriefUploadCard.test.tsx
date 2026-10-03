// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BriefUploadCard } from "../components/BriefUploadCard";

describe("BriefUploadCard Component", () => {
  it("renders with locked container height min-h-[260px]", () => {
    render(<BriefUploadCard onFileSelect={vi.fn()} />);
    const card = screen.getByTestId("brief-upload-card");
    expect(card.className).toContain("min-h-[260px]");
  });

  it("displays the sanitizing status pill when isUploading is true", () => {
    render(<BriefUploadCard onFileSelect={vi.fn()} isUploading={true} />);
    const pill = screen.getByTestId("sanitizing-status-pill");
    expect(pill).toBeDefined();
    expect(pill.textContent).toContain("Sanitizing brief and extracting core questions...");
  });

  it("triggers onFileSelect immediately when a file is selected", () => {
    const handleSelect = vi.fn();
    render(<BriefUploadCard onFileSelect={handleSelect} />);

    const input = screen.getByLabelText("Upload assignment brief file");
    const file = new File(["dummy pdf content"], "tutorial.pdf", { type: "application/pdf" });

    fireEvent.change(input, { target: { files: [file] } });
    expect(handleSelect).toHaveBeenCalledWith(file);
  });
});
