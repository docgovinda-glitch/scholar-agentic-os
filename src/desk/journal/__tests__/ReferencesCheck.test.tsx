// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import ReferencesCheck from "../ReferencesCheck";
import type { CitationAudit, CitationAuditRow } from "../../../domain/journal/referenceAudit";

const row = (r: Partial<CitationAuditRow> & { id: string; state: CitationAuditRow["state"] }): CitationAuditRow => ({ title: `Title ${r.id}`, blocking: false, ...r });
const audit = (rows: CitationAuditRow[], extra: Partial<CitationAudit> = {}): CitationAudit => ({
  rows,
  blocking: rows.filter((r) => r.blocking).length,
  warnings: rows.filter((r) => !r.blocking && ["concern", "corrected", "unchecked"].includes(r.state)).length,
  uncited: [],
  ...extra,
});

function setup(props: Partial<React.ComponentProps<typeof ReferencesCheck>> & { audit: CitationAudit }) {
  const onCheck = vi.fn();
  const onAcknowledge = vi.fn();
  render(
    <ReferencesCheck
      references={[]}
      styleLabel="APA 7"
      numbered={false}
      hasText
      canCheck
      checking={false}
      checkError={null}
      onCheck={onCheck}
      acknowledged={[]}
      onAcknowledge={onAcknowledge}
      {...props}
    />
  );
  return { onCheck, onAcknowledge };
}

describe("ReferencesCheck", () => {
  it("says there is nothing to check without text, and no citations when the text has none", () => {
    setup({ audit: audit([]), hasText: false });
    expect(screen.getByText("Nothing to check yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Check DOIs/ })).not.toBeInTheDocument();
  });

  it("reports no citations in the text", () => {
    setup({ audit: audit([]) });
    expect(screen.getByText("No citations in the text")).toBeInTheDocument();
  });

  it("counts what blocks export, what needs review, and when everything is resolved", () => {
    setup({ audit: audit([row({ id: "a", state: "missing", blocking: true }), row({ id: "b", state: "verified" })]) });
    expect(screen.getByText("1 to fix before export")).toBeInTheDocument();
  });

  it("shows a review count for warnings and all-resolved otherwise", () => {
    setup({ audit: audit([row({ id: "a", state: "concern" }), row({ id: "b", state: "verified" })]) });
    expect(screen.getByText("2 cited · 1 to review")).toBeInTheDocument();
  });

  it("shows all resolved when every citation is registered", () => {
    setup({ audit: audit([row({ id: "a", state: "verified" }), row({ id: "b", state: "data" })]) });
    expect(screen.getByText("2 cited · all resolved")).toBeInTheDocument();
  });

  it("describes each citation by its state, and the raw id when the source has no title", () => {
    setup({ audit: audit([row({ id: "ghost", title: "", state: "missing", blocking: true }), row({ id: "doi1", state: "unchecked" })]) });
    const list = screen.getByRole("list", { name: "Citations" });
    expect(within(list).getByText("[CITE:ghost]")).toBeInTheDocument();
    expect(within(list).getByText("No source")).toBeInTheDocument();
    expect(within(list).getByText("Not checked")).toBeInTheDocument();
  });

  it("links a retraction notice only when it is a web address", () => {
    setup({
      audit: audit([
        row({ id: "r1", state: "retracted", blocking: true, notice: "https://doi.org/10.1/retraction" }),
        row({ id: "r2", state: "retracted", blocking: true, notice: "javascript:alert(1)" }),
      ]),
    });
    const links = screen.getAllByRole("link", { name: "Notice" });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "https://doi.org/10.1/retraction");
    expect(links[0]).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("lets the author acknowledge a retracted citation, and only that kind", () => {
    const { onAcknowledge } = setup({ audit: audit([row({ id: "r1", state: "retracted", blocking: true }), row({ id: "v1", state: "verified" })]), acknowledged: [] });
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(1);
    fireEvent.click(boxes[0]);
    expect(onAcknowledge).toHaveBeenCalledWith("r1", true);
  });

  it("shows an acknowledged retraction as checked", () => {
    setup({ audit: audit([row({ id: "r1", state: "retracted", blocking: true })]), acknowledged: ["r1"] });
    expect(screen.getByRole("checkbox")).toBeChecked();
  });

  it("runs the check when the button is pressed", () => {
    const { onCheck } = setup({ audit: audit([row({ id: "a", state: "unchecked" })]) });
    fireEvent.click(screen.getByRole("button", { name: "Check DOIs and retractions" }));
    expect(onCheck).toHaveBeenCalledTimes(1);
  });

  it("is disabled while checking", () => {
    setup({ audit: audit([row({ id: "a", state: "unchecked" })]), checking: true });
    expect(screen.getByRole("button", { name: "Checking…" })).toBeDisabled();
  });

  it("explains when there is no DOI to check", () => {
    setup({ audit: audit([row({ id: "a", state: "unregistered" })]), canCheck: false });
    expect(screen.getByRole("button", { name: /Check DOIs/ })).toBeDisabled();
    expect(screen.getByText("None of the cited sources has a DOI to check.")).toBeInTheDocument();
  });

  it("shows when it was last checked, and never 'Invalid Date'", () => {
    const rows = [row({ id: "a", state: "verified" })];
    setup({ audit: audit(rows), lastChecked: "2026-11-02T10:00:00.000Z" });
    expect(screen.getByText(/Last checked/)).toBeInTheDocument();
  });

  it("leaves out an unreadable last-checked time", () => {
    setup({ audit: audit([row({ id: "a", state: "verified" })]), lastChecked: "not a date" });
    expect(document.body.textContent).not.toContain("Invalid Date");
    expect(document.body.textContent).not.toContain("Last checked");
  });

  it("shows a check error as an alert", () => {
    setup({ audit: audit([row({ id: "a", state: "unchecked" })]), checkError: "Crossref could not be reached." });
    expect(screen.getByRole("alert")).toHaveTextContent("Crossref could not be reached.");
  });

  it("says how many sources are uncited", () => {
    const src = { id: "u", title: "U", authors: [], isUserData: false };
    setup({ audit: audit([row({ id: "a", state: "verified" })], { uncited: [src, { ...src, id: "u2" }] }) });
    expect(screen.getByText(/2 sources are in Evidence but not cited; they stay out/)).toBeInTheDocument();
  });

  it("leaves author-date reference lists unnumbered", () => {
    setup({ audit: audit([row({ id: "a", state: "verified" })]), references: ["Smith, J. (2020)."], numbered: false });
    expect(document.querySelector("ol")).toHaveClass("list-none");
  });

  it("lists the reference list with italics marks removed, numbered for numbered styles", () => {
    setup({ audit: audit([row({ id: "a", state: "verified" })]), references: ["Smith, J. (2020). *Nature*, 5."], numbered: true });
    expect(screen.getByText("Smith, J. (2020). Nature, 5.")).toBeInTheDocument();
    expect(screen.getByText("Reference list (APA 7, 1 entry)")).toBeInTheDocument();
    expect(document.querySelector("ol")).toHaveClass("list-decimal");
  });
});
