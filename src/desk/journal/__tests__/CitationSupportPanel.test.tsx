// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import CitationSupportPanel, { parseSavedSupport, type SavedSupport } from "../CitationSupportPanel";
import { textFingerprint, type SupportResult } from "../../../domain/journal/citationSupport";

const api = vi.hoisted(() => ({ authedJsonFetch: vi.fn() }));
vi.mock("../../api", () => api);

const manuscript = "Sleep improves recall [CITE:a]. Caffeine does not [CITE:b].";
const result = (r: Partial<SupportResult> & { key: string; verdict: SupportResult["verdict"] }): SupportResult => ({ citeId: "a", sentence: `Sentence ${r.key}.`, reason: `Reason ${r.key}.`, ...r });
const saved = (results: SupportResult[], extra: Partial<SavedSupport> = {}): SavedSupport => ({ fingerprint: textFingerprint(manuscript), checkedAt: "2026-11-02T10:00:00.000Z", truncated: 0, results, ...extra });
const titleOf = (id: string) => (id === "a" ? "Sleep study" : id);

function setup(props: Partial<React.ComponentProps<typeof CitationSupportPanel>> = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(<CitationSupportPanel projectId="p1" manuscript={manuscript} saved={null} titleOf={titleOf} onSave={onSave} {...props} />);
  return { onSave };
}
const reply = (ok: boolean, body: unknown) => ({ ok, json: async () => body });

beforeEach(() => api.authedJsonFetch.mockReset());

describe("CitationSupportPanel", () => {
  it("offers a first check, disabled with no manuscript", () => {
    setup();
    expect(screen.getByRole("button", { name: "Check with my AI" })).toBeEnabled();
    setup({ manuscript: "   " });
    expect(screen.getAllByRole("button", { name: "Check with my AI" })[1]).toBeDisabled();
  });

  it("runs the check against the project, then saves the results with the server's fingerprint", async () => {
    api.authedJsonFetch.mockResolvedValue(reply(true, { results: [result({ key: "p1", verdict: "supports" })], truncated: 2, fingerprint: "abc" }));
    const { onSave } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Check with my AI" }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(api.authedJsonFetch).toHaveBeenCalledWith("/api/projects/p1/agentic/citations/support", "POST", {});
    expect(onSave.mock.calls[0][0]).toMatchObject({ fingerprint: "abc", truncated: 2, results: [{ key: "p1", verdict: "supports" }] });
  });

  it("falls back to the manuscript's own fingerprint when the server sends none", async () => {
    api.authedJsonFetch.mockResolvedValue(reply(true, { results: [] }));
    const { onSave } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Check with my AI" }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].fingerprint).toBe(textFingerprint(manuscript));
  });

  it("shows the server's error, or a plain one, and keeps working afterwards", async () => {
    api.authedJsonFetch.mockResolvedValueOnce(reply(false, { error: "The AI's answer could not be read." }));
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Check with my AI" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The AI's answer could not be read.");
    expect(screen.getByRole("button", { name: "Check with my AI" })).toBeEnabled();
  });

  it("shows a network failure as the same plain message", async () => {
    api.authedJsonFetch.mockRejectedValueOnce(new Error("offline"));
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Check with my AI" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("offline");
  });

  it("is busy while checking", async () => {
    let finish!: (v: unknown) => void;
    api.authedJsonFetch.mockReturnValue(new Promise((r) => (finish = r)));
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Check with my AI" }));
    expect(screen.getByRole("button", { name: "Checking…" })).toBeDisabled();
    finish(reply(true, { results: [] }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Check with my AI" })).toBeEnabled());
  });

  it("lists the problems first and hides the supported ones until asked", () => {
    setup({
      saved: saved([
        result({ key: "p1", verdict: "supports", sentence: "Supported sentence." }),
        result({ key: "p2", verdict: "does_not_support", sentence: "Wrong sentence." }),
        result({ key: "p3", verdict: "partly", sentence: "Partial sentence." }),
        result({ key: "p4", verdict: "cannot_tell", sentence: "Unclear sentence." }),
      ]),
    });
    const items = screen.getAllByRole("listitem").map((li) => li.textContent ?? "");
    expect(items).toHaveLength(3);
    expect(items[0]).toContain("Wrong sentence.");
    expect(items[1]).toContain("Partial sentence.");
    expect(items[2]).toContain("Unclear sentence.");
    expect(screen.getByText(/1 don't · 1 partly · 1 can't tell · 1 support/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Show the 1 that support their sentence/ }));
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByText("Supported sentence.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Hide the 1 that support/ }));
    expect(screen.queryByText("Supported sentence.")).not.toBeInTheDocument();
  });

  it("names the source by its title and quotes the recorded words", () => {
    setup({ saved: saved([result({ key: "p1", verdict: "partly", citeId: "a", quote: "recalled 20% more word pairs" })]) });
    expect(screen.getByText(/Source: Sleep study\./)).toBeInTheDocument();
    expect(screen.getByText("“recalled 20% more word pairs”")).toBeInTheDocument();
  });

  it("says when the text changed since the check", () => {
    setup({ saved: saved([result({ key: "p1", verdict: "supports" })], { fingerprint: "old" }) });
    expect(screen.getByText("The text has changed since this check; run it again.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check again" })).toBeInTheDocument();
  });

  it("says when it was checked, never 'Invalid Date'", () => {
    setup({ saved: saved([]) });
    expect(screen.getByText(/^Checked /)).toBeInTheDocument();
  });

  it("leaves out an unreadable check time", () => {
    setup({ saved: saved([], { checkedAt: "garbage" }) });
    expect(document.body.textContent).not.toContain("Invalid Date");
    expect(document.body.textContent).not.toMatch(/Checked /);
  });

  it("says how many citations were not checked", () => {
    setup({ saved: saved([], { truncated: 7 }) });
    expect(screen.getByText("The first 40 citations were checked; 7 more were not.")).toBeInTheDocument();
  });
});

describe("parseSavedSupport", () => {
  it("reads a saved check from JSON text or an object", () => {
    const s = saved([result({ key: "p1", verdict: "supports" })]);
    expect(parseSavedSupport(JSON.stringify(s))?.results).toHaveLength(1);
    expect(parseSavedSupport(s)?.fingerprint).toBe(s.fingerprint);
  });

  it("returns null for nothing, bad JSON or the wrong shape", () => {
    for (const bad of [null, undefined, "", "{not json", "[]", 5, { results: "x" }]) expect(parseSavedSupport(bad), String(bad)).toBeNull();
  });

  it("drops results a damaged save left unreadable, so the screen can't break on them", () => {
    const out = parseSavedSupport({
      fingerprint: 5,
      results: [
        { key: "p1", citeId: "a", sentence: "Ok.", verdict: "supports" },
        { key: "p2", citeId: "a", sentence: "Unknown verdict.", verdict: "great" },
        { key: "p3", citeId: "a", verdict: "partly" },
        null,
        "text",
      ],
    })!;
    expect(out.results.map((r) => r.key)).toEqual(["p1"]);
    expect(out.results[0].reason).toBe("");
    expect(out.fingerprint).toBe("");
    expect(out.truncated).toBe(0);
  });

  it("renders a saved check with an unknown verdict without crashing", () => {
    setup({ saved: parseSavedSupport({ results: [{ key: "p1", citeId: "a", sentence: "Ok.", verdict: "great" }] }) });
    expect(screen.getByRole("list", { name: "Citation checks" })).toBeEmptyDOMElement();
  });
});
