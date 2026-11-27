/** @vitest-environment jsdom */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { AskPromptBox } from "../AskPromptBox";
import { DEFAULT_SCHOLAR_FILTERS } from "../../../domain/ask/scholarFilters";

const phoneScreen = (matches: boolean) => {
  // jsdom has no matchMedia: stand one in for the phone-width query.
  window.matchMedia = vi.fn(
    (query: string) => ({ matches, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }) as unknown as MediaQueryList
  );
};

const box = () =>
  render(
    <AskPromptBox
      value=""
      onValueChange={() => undefined}
      onSend={() => undefined}
      attachments={[]}
      onRemoveAttachment={() => undefined}
      onAttachFiles={() => undefined}
      isUploading={false}
      mode="auto"
      onModeChange={() => undefined}
      isThinking={false}
      placeholder="Ask a research question…"
      ariaLabel="Ask a question"
      sendLabel="Send message"
      filters={DEFAULT_SCHOLAR_FILTERS}
      onFiltersChange={() => undefined}
    >
      <button type="button">APA 7th</button>
    </AskPromptBox>
  );

afterEach(() => {
  cleanup();
  delete (window as { matchMedia?: unknown }).matchMedia;
});

describe("AskPromptBox on a phone", () => {
  it("keeps one toolbar row: the mode toggle stays, the filters and settings open in an options tray", () => {
    phoneScreen(true);
    box();
    expect(screen.getByRole("button", { name: "Quick Scholar" })).toBeInTheDocument();
    expect(screen.queryByTestId("scholar-year-filter")).toBeNull();
    expect(screen.queryByRole("button", { name: "APA 7th" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Options" }));
    expect(screen.getByRole("button", { name: "Options" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("scholar-year-filter")).toHaveTextContent("Any year");
    expect(screen.getByRole("button", { name: "APA 7th" })).toBeInTheDocument();
  });

  it("shows everything in one row on a wider screen, with no options button", () => {
    phoneScreen(false);
    box();
    expect(screen.queryByRole("button", { name: "Options" })).toBeNull();
    expect(screen.getByTestId("scholar-year-filter")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "APA 7th" })).toBeInTheDocument();
  });
});
