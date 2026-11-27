// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { InlineCitationBadge } from "../guideHelper";
import { claimKey } from "../../../domain/ask/passageMatch";

const claim = "Sleep after learning improved recall of word pairs";
const citation = {
  title: "Sleep and memory",
  url: "https://example.org/sleep",
  snippet: "A short abstract that says little.",
  sourceType: "scholarly" as const,
  claimPassages: [{ claim, key: claimKey(claim), passage: "Sleep after learning improved recall of word pairs by a clear margin." }],
};

const phoneScreen = (matches: boolean) => {
  window.matchMedia = vi.fn(
    (query: string) => ({ matches, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }) as unknown as MediaQueryList
  );
};

afterEach(() => {
  cleanup();
  delete (window as { matchMedia?: unknown }).matchMedia;
});

describe("a citation shows the passage that backs its claim", () => {
  it("uses the passage Deep Research traced in the source's fuller text", () => {
    render(<InlineCitationBadge num={1} citation={citation} claim={claim} />);
    expect(screen.getByTestId("citation-supporting-passage")).toHaveTextContent("by a clear margin");
    expect(screen.getByText("Closest passage in the source")).toBeInTheDocument();
  });

  it("says so plainly when the source's text has no matching sentence", () => {
    const other = "Caffeine changed recall in students";
    render(
      <InlineCitationBadge
        num={1}
        citation={{ ...citation, claimPassages: [{ claim: other, key: claimKey(other), passage: null }] }}
        claim={other}
      />
    );
    expect(screen.queryByTestId("citation-supporting-passage")).toBeNull();
    expect(screen.getByTestId("citation-no-passage")).toHaveTextContent("No sentence in this source's text clearly matches this claim.");
  });

  it("on a phone, a tap opens the card as a sheet instead of jumping away", () => {
    phoneScreen(true);
    render(<InlineCitationBadge num={1} citation={citation} claim={claim} />);
    expect(screen.queryByTestId("citation-micro-card")).toBeNull();
    fireEvent.click(screen.getByTestId("citation-chip-1"));
    const sheet = screen.getByTestId("citation-sheet");
    expect(sheet).toHaveTextContent("by a clear margin");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByTestId("citation-sheet")).toBeNull();
  });

  it("says when Deep Research read the source in full, not only its abstract", () => {
    render(<InlineCitationBadge num={1} citation={{ ...citation, fullTextRead: "pmc" }} claim={claim} />);
    expect(screen.getByTestId("citation-full-text")).toHaveTextContent("Full text read");
  });
});
