// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { AnswerReviewPanel } from "../AnswerReviewPanel";

describe("AnswerReviewPanel", () => {
  it("never shows a synthetic rigor score or canned audit when no stress-test ran", () => {
    const { container } = render(
      <AnswerReviewPanel
        prompt="Compare Wendt and Mearsheimer"
        answerText="Wendt argues that identities matter."
        retrieved={[{ title: "Wendt and social theory", snippet: "constructivism" }]}
        cited={[{ title: "Wendt and social theory" }]}
      />
    );
    const text = container.textContent || "";
    expect(text).not.toMatch(/84\/100|91\/100|\/100/);
    expect(text).not.toMatch(/Emerging Consensus|Sample Bias|anti-hallucination/i);
    expect(text).toMatch(/No peer-review stress-test has been run/);
    expect(screen.getByText("Mearsheimer")).toBeInTheDocument();
    expect(text).toMatch(/not found in retrieved sources/);
  });
});
