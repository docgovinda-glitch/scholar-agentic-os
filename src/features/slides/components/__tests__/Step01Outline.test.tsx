// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import fs from "node:fs";
import path from "node:path";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import Step01Understand from "../Step01Understand";
import type { SlideDeck } from "../../types/slides";

const QNT = fs.readFileSync(path.join(__dirname, "../../../../utils/__tests__/fixtures/qnt4020-brief.txt"), "utf8");
const emptyDeck = (): SlideDeck => ({ id: "d1", title: "Untitled Presentation", slides: [], activeSlideIndex: 0 });

/** A tiny stateful host so edits flow back into the component like in the workspace. */
function Host({ onNext = vi.fn(), spy }: { onNext?: () => void; spy?: (d: SlideDeck) => void }) {
  const [deck, setDeck] = React.useState<SlideDeck>(emptyDeck());
  return <Step01Understand deck={deck} onNextStep={onNext} onUpdateDeck={(d) => { setDeck(d); spy?.(d); }} />;
}

afterEach(() => cleanup());

describe("Step 01: Gamma-style outline", () => {
  it("offers only a slide-count selector (6, 8, 10, 12, 15) and no fake pre-filled cards", () => {
    render(<Host />);
    const options = within(screen.getByLabelText("Slide Count")).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["6 slides", "8 slides", "10 slides", "12 slides", "15 slides"]);
    for (const gone of [/Talk length/i, /Presentation Style/i, /Audience Level/i, /What This Presentation Covers/i, /What to Avoid/i]) {
      expect(screen.queryByText(gone)).not.toBeInTheDocument();
    }
    expect(screen.queryByTestId("outline-builder")).not.toBeInTheDocument();
  });

  it("uploading the QNT-4020 brief writes a clean title and a full 10-slide outline automatically", async () => {
    render(<Host />);
    fireEvent.click(screen.getByRole("button", { name: /Upload Document/i }));
    fireEvent.change(screen.getByLabelText("Slide Count"), { target: { value: "10" } });
    const file = new File([QNT], "QNT-4020-brief.txt", { type: "text/plain" });
    fireEvent.change(screen.getByTestId("presentation-file-input"), { target: { files: [file] } });

    await waitFor(() => expect(screen.getByTestId("outline-builder")).toBeInTheDocument());
    expect((screen.getByLabelText("Presentation title") as HTMLInputElement).value).toBe("Branches of Quantum Computing");
    for (let n = 1; n <= 10; n++) expect(screen.getByTestId(`outline-card-${n}`)).toBeInTheDocument();
    expect(screen.queryByTestId("outline-card-11")).not.toBeInTheDocument();
    const outlineText = [...document.querySelectorAll<HTMLInputElement>('[data-testid="outline-builder"] input')].map((i) => i.value).join(" ") + (screen.getByTestId("outline-builder").textContent ?? "");
    expect(outlineText).not.toMatch(/-4020|QNT|DEPARTMENT OF COMPUTER SCIENCE/);
    // Each card shows a visual-type badge, a title and bullet points.
    expect(screen.getByLabelText("Slide 1 visual type")).toHaveValue("Title Hero");
    expect(screen.getByLabelText("Slide 10 visual type")).toHaveValue("Key Takeaways");
  });

  it("lets the presenter edit, reorder, add and delete cards, then builds slides on Proceed", async () => {
    const onNext = vi.fn();
    const updates: SlideDeck[] = [];
    render(<Host onNext={onNext} spy={(d) => updates.push(d)} />);
    fireEvent.change(screen.getByLabelText(/Presentation topic/i), { target: { value: "Surface codes" } });
    fireEvent.change(screen.getByLabelText("Slide Count"), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: /Generate outline/i }));
    await screen.findByTestId("outline-builder");

    fireEvent.change(screen.getByLabelText("Slide 2 title"), { target: { value: "Why thresholds matter" } });
    expect(screen.getByLabelText("Slide 2 title")).toHaveValue("Why thresholds matter");

    const secondTitle = (screen.getByLabelText("Slide 2 title") as HTMLInputElement).value;
    fireEvent.click(screen.getByRole("button", { name: "Move slide 2 down" }));
    expect((screen.getByLabelText("Slide 3 title") as HTMLInputElement).value).toBe(secondTitle);

    const before = screen.getAllByTestId(/^outline-card-/).length;
    fireEvent.click(screen.getByRole("button", { name: /Add Slide/i }));
    expect(screen.getAllByTestId(/^outline-card-/).length).toBe(before + 1);
    fireEvent.click(screen.getByRole("button", { name: "Delete slide 2" }));
    expect(screen.getAllByTestId(/^outline-card-/).length).toBe(before);

    fireEvent.click(screen.getByRole("button", { name: /Proceed to Design/i }));
    await waitFor(() => expect(onNext).toHaveBeenCalled());
    const built = updates.at(-1)!;
    expect(built.slides.length).toBe(before);
    expect(built.slides[0].actionHeadline).toBeTruthy();
    expect(JSON.stringify(built)).not.toMatch(/-4020/);
  });
});
