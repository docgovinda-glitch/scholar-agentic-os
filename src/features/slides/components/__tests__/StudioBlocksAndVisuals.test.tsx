// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { addBlock, BLOCK_SPECS, LAYOUT_SWITCHER } from "../../gamma/blocks";
import { composeDeckFromOutline } from "../../gamma/composer";
import { recommendVisual, layoutForVisual } from "../../gamma/visualPlan";
import { computeCardGeometry } from "../../gamma/geometry";
import { getCardContent, resolveLayout } from "../../gamma/content";
import { DECK_THEMES } from "../../gamma/theme";
import VisualPlanner from "../VisualPlanner";
import { AddBlockMenu, SlideLayoutSwitcher } from "../StudioBlockTools";
import type { CardContent, SlideDeck } from "../../types/slides";

afterEach(() => cleanup());

const base: CardContent = { headline: "Threshold theorem", items: [{ title: "Existing" }], stats: [] };

describe("typed blocks", () => {
  it("offers the six block kinds with guidance", () => {
    expect(BLOCK_SPECS.map((b) => b.label)).toEqual([
      "Key Insight Card", "Comparison Column", "Diagram / Flowchart Block", "Evidence Callout", "Image / Media Slot", "Metric Card",
    ]);
    expect(BLOCK_SPECS.every((b) => b.guidance.length > 10)).toBe(true);
  });

  it("adds each kind in the right place and never invents a number", () => {
    const insight = addBlock(base, "bento", "insight", { title: "Errors fall", body: "Below threshold, more qubits lower the logical error rate." });
    expect(insight.content.items.at(-1)).toMatchObject({ title: "Errors fall" });
    const col = addBlock(base, "list", "column");
    expect(col.layout).toBe("comparison");
    expect(col.content.columns).toBeDefined();
    expect(addBlock(base, "bento", "diagram").layout).toBe("timeline");
    expect(addBlock(base, "bento", "evidence").content.takeaway).toBeTruthy();
    expect(addBlock(base, "bento", "media")).toMatchObject({ needsImage: true, layout: "split" });
    const metric = addBlock(base, "bento", "metric");
    expect(metric.layout).toBe("stats");
    expect(metric.content.stats.at(-1)?.value).toBe("—");
  });

  it("refuses to overfill a card", () => {
    const full: CardContent = { ...base, items: Array.from({ length: 6 }, (_, i) => ({ title: `i${i}` })) };
    expect(addBlock(full, "bento", "insight").added).toBe(false);
  });
});

describe("layout switcher and add menu", () => {
  it("shows every layout and switches in one click", () => {
    const onChange = vi.fn();
    render(<SlideLayoutSwitcher layout="title" onChange={onChange} />);
    expect(LAYOUT_SWITCHER.map((l) => l.label)).toEqual([
      "Title", "Bento", "3 columns", "2 × 2 grid", "Text + visual", "Big numbers", "Timeline", "Table", "Quote", "Pyramid", "Problem → fix", "Takeaways", "Two sides", "Key points", "Statement",
    ]);
    fireEvent.click(screen.getByRole("radio", { name: /^Table$/ }));
    expect(onChange).toHaveBeenCalledWith("table");
  });

  it("lists block kinds with Write with AI per block", () => {
    const onAdd = vi.fn();
    render(<AddBlockMenu onAdd={onAdd} busyKind={null} canWriteWithAi />);
    fireEvent.click(screen.getByTestId("studio-add-block-btn"));
    const menu = screen.getByRole("menu");
    expect(within(menu).getByText("Evidence Callout")).toBeInTheDocument();
    fireEvent.click(within(menu).getAllByRole("button", { name: /Write with AI/ })[0]);
    expect(onAdd).toHaveBeenCalledWith("insight", true);
  });
});

describe("table layout renders from the same content", () => {
  it("draws a header row and rows from two columns", () => {
    const content: CardContent = { headline: "QKD vs PQC", items: [], stats: [], columns: [{ title: "QKD", points: ["Physics-based security", "Needs dedicated links"] }, { title: "PQC", points: ["Math-based security", "Runs on existing networks"] }] };
    const geo = computeCardGeometry(content, "table", DECK_THEMES[0], 1);
    const texts = geo.elements.filter((e) => e.kind === "text").map((e) => (e as { text: string }).text);
    expect(texts).toEqual(expect.arrayContaining(["QKD", "PQC", "Physics-based security", "Runs on existing networks"]));
  });
});

describe("outline to slides and visual planning", () => {
  const outline = [
    { title: "Branches of Quantum Computing", visualType: "Title Hero", bullets: [] },
    { title: "QKD vs. Post-Quantum Cryptography", visualType: "2-Column Comparison", bullets: ["QKD relies on physics", "PQC relies on hard maths", "PQC runs on today's networks"] },
    { title: "Surface codes", visualType: "Architecture Diagram", bullets: ["Syndrome measurement", "Threshold theorem"] },
    { title: "Key takeaways", visualType: "Key Takeaways", bullets: [] },
  ];

  it("builds one slide per outline card, with the chosen layout and no course codes", () => {
    const deck = composeDeckFromOutline(outline, { title: "QNT-4020 Branches of Quantum Computing" });
    expect(deck.slides).toHaveLength(4);
    expect(deck.title).toBe("Branches of Quantum Computing");
    expect(resolveLayout(deck.slides[0], 0)).toBe("title");
    expect(resolveLayout(deck.slides[1], 1)).toBe("comparison");
    expect(getCardContent(deck.slides[1]).columns?.[0].points.length).toBeGreaterThan(0);
    expect(JSON.stringify(deck)).not.toMatch(/-4020|QNT/);
  });

  it("recommends a visual per slide and applies only what the presenter picks", () => {
    const deck = composeDeckFromOutline(outline, { title: "Quantum" });
    expect(recommendVisual(deck.slides[1], "2-Column Comparison")).toBe("table");
    expect(recommendVisual(deck.slides[2], "Architecture Diagram")).toBe("diagram");
    expect(recommendVisual(deck.slides[0], "Title Hero")).toBeNull();
    const onUpdate = vi.fn();
    render(<VisualPlanner deck={deck as SlideDeck} onUpdateDeck={onUpdate} />);
    expect(screen.getByTestId("visual-rec-2")).toHaveTextContent("recommended: Comparison Table");
    expect(screen.getByTestId("visual-rec-3")).toHaveTextContent("recommended: Smart Diagram");
    expect(onUpdate).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Visual for slide 3" })).getByRole("radio", { name: /Multi-Card Grid/ }));
    const updated = onUpdate.mock.calls[0][0] as SlideDeck;
    expect(updated.slides[2].visualPlan).toBe("grid");
    expect(resolveLayout(updated.slides[2], 2)).toBe(layoutForVisual("grid"));
  });
});
