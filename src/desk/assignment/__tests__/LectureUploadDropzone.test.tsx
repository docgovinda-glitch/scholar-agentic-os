// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const authedFetch = vi.fn();
vi.mock("../../api", () => ({
  authedFetch: (...a: unknown[]) => authedFetch(...a),
  authedJsonFetch: vi.fn(async () => ({ ok: true, json: async () => ({}) })),
  executeAgenticLLM: vi.fn(async () => { throw new Error("no AI"); }),
}));

import { LectureUploadDropzone } from "../components/LectureUploadDropzone";

const ok = (text: string) => ({ ok: true, json: async () => ({ title: "Notes", sourceType: "text", text }) });
const fail = (status: number, error: string) => ({ ok: false, status, json: async () => ({ error }) });

describe("LectureUploadDropzone (Stage 3 manual uploads)", () => {
  afterEach(() => { cleanup(); authedFetch.mockReset(); });

  it("refuses empty and unreadable files with reasons and never saves a placeholder", async () => {
    authedFetch.mockResolvedValue(fail(400, "Failed to parse document: Invalid PDF structure."));
    const onUpload = vi.fn();
    render(<LectureUploadDropzone uploadedFiles={[]} onUpload={onUpload} onRemove={vi.fn()} assignmentQuestion="Monetary policy and inflation" citationStyle="apa7" projectId="p1" />);
    const input = screen.getByTestId("lecture-file-input");
    fireEvent.change(input, { target: { files: [new File([], "empty.txt"), new File(["%PDF garbage"], "corrupt.pdf", { type: "application/pdf" })] } });
    const alert = await screen.findByTestId("source-upload-problems");
    expect(alert).toHaveTextContent("empty.txt: the file is empty");
    expect(alert).toHaveTextContent("corrupt.pdf: Failed to parse document");
    expect(onUpload).not.toHaveBeenCalled();
  });

  it("keeps the parsed text with the saved document", async () => {
    authedFetch.mockResolvedValue(ok("Lecture notes: the policy rate passes through to lending rates."));
    const onUpload = vi.fn();
    render(<LectureUploadDropzone uploadedFiles={[]} onUpload={onUpload} onRemove={vi.fn()} assignmentQuestion="Monetary policy and inflation" citationStyle="apa7" projectId="p1" />);
    fireEvent.change(screen.getByTestId("lecture-file-input"), { target: { files: [new File(["x"], "notes.txt", { type: "text/plain" })] } });
    await waitFor(() => expect(onUpload).toHaveBeenCalled());
    const [docs] = onUpload.mock.calls[0];
    expect(docs[0].name).toBe("notes.txt");
    expect(docs[0].extractedText).toContain("policy rate passes through");
  });
});
