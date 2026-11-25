// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { IncompleteAnswerBanner } from "../IncompleteAnswerBanner";

describe("IncompleteAnswerBanner", () => {
  it("offers Continue Generating and Retry with Another Model", () => {
    const onContinue = vi.fn();
    const onRetry = vi.fn();
    render(<IncompleteAnswerBanner onContinue={onContinue} onRetryAnotherModel={onRetry} />);
    fireEvent.click(screen.getByRole("button", { name: "Continue Generating" }));
    fireEvent.click(screen.getByRole("button", { name: "Retry with Another Model" }));
    expect(onContinue).toHaveBeenCalledOnce();
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
