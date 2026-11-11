// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import fs from "node:fs";
import path from "node:path";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { SubQuestionsCard } from "../components/BriefBreakdownCards";

const BRIEF = fs.readFileSync(path.join(__dirname, "../../../utils/__tests__/fixtures/qnt4020-pdf-brief.txt"), "utf8");

describe("sub-questions card (QNT-4020 PDF brief)", () => {
  afterEach(() => cleanup());

  it("budgets main questions only: sub-parts sit inside their question and are never double-counted", () => {
    const onWordsChange = vi.fn();
    render(<SubQuestionsCard briefText={BRIEF} totalWords={2000} onWordsChange={onWordsChange} />);
    const last = onWordsChange.mock.calls.at(-1)![0] as Array<{ label: string; words: number }>;
    expect(last.map((t) => t.label)).toEqual(["Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7"]);
    expect(last.reduce((n, t) => n + t.words, 0)).toBe(2000);
    expect(screen.getByText("15 Marks (16.67%)")).toBeInTheDocument();
    expect(screen.getByText("5 Marks · part of Q1")).toBeInTheDocument();
    expect(screen.queryByText(/13\.89%|108/)).toBeNull();
  });
});
