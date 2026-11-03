// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import OutlineByAiPanel from "../components/OutlineByAiPanel";
import type { AssignmentStructure } from "../types";

const base = { version: 1, isConfirmed: false, targetWordCount: 2000, totalAllocated: 2000, headings: [] } as AssignmentStructure;

describe("outline panel", () => {
  afterEach(() => cleanup());

  it("labels a starter outline and writes one from the brief", async () => {
    const onRewrite = vi.fn().mockResolvedValue({ ok: true, structure: { ...base, source: "ai" } });
    render(<OutlineByAiPanel structure={{ ...base, source: "starter" }} onRewrite={onRewrite} onRestore={vi.fn()} />);
    expect(screen.getByText(/Starter outline\./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Write the outline from my brief/ }));
    await waitFor(() => expect(onRewrite).toHaveBeenCalledWith(undefined));
  });

  it("revises an AI outline on request, can undo, and shows errors", async () => {
    const ai = { ...base, source: "ai" as const, rationale: "Written by your AI from your brief." };
    const onRewrite = vi.fn().mockResolvedValueOnce({ ok: true, structure: ai }).mockResolvedValueOnce({ ok: false, error: "No AI answered." });
    const onRestore = vi.fn().mockResolvedValue(undefined);
    render(<OutlineByAiPanel structure={ai} onRewrite={onRewrite} onRestore={onRestore} />);
    expect(screen.getByText("Written by your AI from your brief.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Change the outline"), { target: { value: "add a section on ethics" } });
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    await waitFor(() => expect(onRewrite).toHaveBeenCalledWith("add a section on ethics"));
    fireEvent.click(await screen.findByRole("button", { name: /Undo the last outline change/ }));
    expect(onRestore).toHaveBeenCalledWith(ai);
    fireEvent.change(screen.getByLabelText("Change the outline"), { target: { value: "shorter" } });
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No AI answered.");
  });
});
