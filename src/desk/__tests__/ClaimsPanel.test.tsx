// @vitest-environment jsdom
//
// The Claim–Evidence Graph.
//
// Doc 01 §3 names "evidence-bound" as one of three defining properties of
// Scholar, and before this panel existed nothing in Desk could add a claim,
// cite evidence for it, or see what was unsupported — five server endpoints
// plus source retraction sat unused.
//
// There is no source registry (the Vault only tracks that one exists, not
// its contents) and no automatic claim extraction (that needs app/mesh,
// which is not built), so every assertion here is about the manual path:
// typed claims, typed source ids, typed quotes.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const getClaimGraph = vi.fn();
const getUnsupportedClaims = vi.fn();
const getClaimConflicts = vi.fn();
const getClaimsForSource = vi.fn();
const addClaim = vi.fn();
const bindEvidence = vi.fn();
const removeSource = vi.fn();
vi.mock("../api", () => ({
  getClaimGraph: (...a: unknown[]) => getClaimGraph(...a),
  getUnsupportedClaims: (...a: unknown[]) => getUnsupportedClaims(...a),
  getClaimConflicts: (...a: unknown[]) => getClaimConflicts(...a),
  getClaimsForSource: (...a: unknown[]) => getClaimsForSource(...a),
  addClaim: (...a: unknown[]) => addClaim(...a),
  bindEvidence: (...a: unknown[]) => bindEvidence(...a),
  removeSource: (...a: unknown[]) => removeSource(...a),
}));

const { default: ClaimsPanel } = await import("../claims/ClaimsPanel");

const claim = (over: Record<string, unknown> = {}) => ({ id: "c1", text: "Remote work reduces tacit knowledge sharing.", ...over });

const binding = (over: Record<string, unknown> = {}) => ({
  id: "b1",
  claimId: "c1",
  evidence: [{ sourceId: "smith2020", quote: "Teams reported fewer informal exchanges.", locator: { page: 12 } }],
  strength: "strong",
  rationale: "Directly measures the effect the claim describes.",
  ...over,
});

const emptyGraph = () => ({ claims: [], bindings: [] });
const projectView = () => ({
  projectId: "proj-1",
  outputTypeId: "OT-02",
  answers: {},
  intakeCompleteness: 1,
  hasDocument: false,
  gates: [],
});

beforeEach(() => {
  getClaimGraph.mockResolvedValue(emptyGraph());
  getUnsupportedClaims.mockResolvedValue({ claims: [] });
  getClaimConflicts.mockResolvedValue({ conflicts: [] });
  getClaimsForSource.mockResolvedValue({ claims: [] });
  vi.stubGlobal("crypto", { ...crypto, randomUUID: () => "generated-id" });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

const panel = (onChanged = vi.fn()) => render(<ClaimsPanel projectId="proj-1" onChanged={onChanged} />);

describe("claims", () => {
  it("shows an empty state with nothing recorded", async () => {
    panel();
    expect(await screen.findByText("No claims recorded yet.")).toBeInTheDocument();
  });

  it("adds a claim with a generated id and reports the update", async () => {
    const onChanged = vi.fn();
    addClaim.mockResolvedValue({ ...projectView(), claimGraph: { claims: [claim()], bindings: [] } });
    getClaimGraph.mockResolvedValueOnce(emptyGraph()).mockResolvedValue({ claims: [claim()], bindings: [] });

    panel(onChanged);
    await screen.findByText("No claims recorded yet.");

    fireEvent.change(screen.getByLabelText("New claim"), { target: { value: "Remote work reduces tacit knowledge sharing." } });
    fireEvent.click(screen.getByRole("button", { name: "Add claim" }));

    await waitFor(() =>
      expect(addClaim).toHaveBeenCalledWith("proj-1", { id: "generated-id", text: "Remote work reduces tacit knowledge sharing." })
    );
    // Adding a claim can flip G6, so the caller needs the fresh project state.
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(await screen.findByText("Remote work reduces tacit knowledge sharing.")).toBeInTheDocument();
  });

  it("does not submit a blank claim", async () => {
    panel();
    await screen.findByText("No claims recorded yet.");
    expect(screen.getByRole("button", { name: "Add claim" })).toBeDisabled();
  });
});

describe("what a claim says about itself", () => {
  it("labels a claim with no bindings as unsupported", async () => {
    getClaimGraph.mockResolvedValue({ claims: [claim()], bindings: [] });
    getUnsupportedClaims.mockResolvedValue({ claims: [claim()] });

    panel();
    expect(await screen.findByText("Unsupported")).toBeInTheDocument();
  });

  it("labels a claim with a binding as supported", async () => {
    getClaimGraph.mockResolvedValue({ claims: [claim()], bindings: [binding()] });
    getUnsupportedClaims.mockResolvedValue({ claims: [] });

    panel();
    expect(await screen.findByText("Supported")).toBeInTheDocument();
    expect(screen.getByText(/Teams reported fewer informal exchanges/)).toBeInTheDocument();
  });

  it("flags a claim with both supporting and contradicting evidence as conflicting rather than supported", async () => {
    getClaimGraph.mockResolvedValue({
      claims: [claim()],
      bindings: [binding(), binding({ id: "b2", strength: "contradicts" })],
    });
    getUnsupportedClaims.mockResolvedValue({ claims: [] });
    getClaimConflicts.mockResolvedValue({ conflicts: [{ claimId: "c1", bindingIds: ["b1", "b2"], description: "x" }] });

    panel();
    expect(await screen.findByText("Conflicting evidence")).toBeInTheDocument();
    expect(screen.queryByText("Supported")).not.toBeInTheDocument();
  });
});

describe("citing evidence", () => {
  it("submits a binding with a generated id and the typed fields", async () => {
    getClaimGraph.mockResolvedValueOnce({ claims: [claim()], bindings: [] });
    bindEvidence.mockResolvedValue({ ...projectView(), claimGraph: { claims: [claim()], bindings: [binding()] } });

    panel();
    fireEvent.click(await screen.findByRole("button", { name: "Add evidence" }));

    fireEvent.change(screen.getByLabelText("Source"), { target: { value: "smith2020" } });
    fireEvent.change(screen.getByLabelText("Quote"), { target: { value: "Teams reported fewer informal exchanges." } });
    fireEvent.change(screen.getByLabelText("Page"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("Why?"), { target: { value: "Directly measures the effect the claim describes." } });
    fireEvent.click(screen.getByRole("button", { name: "Save evidence" }));

    await waitFor(() =>
      expect(bindEvidence).toHaveBeenCalledWith("proj-1", {
        id: "generated-id",
        claimId: "c1",
        evidence: [{ sourceId: "smith2020", quote: "Teams reported fewer informal exchanges.", locator: { page: 12 } }],
        strength: "strong",
        rationale: "Directly measures the effect the claim describes.",
      })
    );
  });

  it("will not submit evidence with no quote", async () => {
    getClaimGraph.mockResolvedValue({ claims: [claim()], bindings: [] });
    panel();
    fireEvent.click(await screen.findByRole("button", { name: "Add evidence" }));

    fireEvent.change(screen.getByLabelText("Source"), { target: { value: "smith2020" } });
    fireEvent.change(screen.getByLabelText("Why?"), { target: { value: "Some reason" } });

    // AG-13's "never invents a locator" checkpoint depends on a real quote —
    // the form should not let the button submit without one.
    expect(screen.getByRole("button", { name: "Save evidence" })).toBeDisabled();
  });

  it("can be cancelled without binding anything", async () => {
    getClaimGraph.mockResolvedValue({ claims: [claim()], bindings: [] });
    panel();
    fireEvent.click(await screen.findByRole("button", { name: "Add evidence" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByLabelText("Source")).not.toBeInTheDocument();
    expect(bindEvidence).not.toHaveBeenCalled();
  });
});

describe("retracting a source", () => {
  it("shows which claims depend on the source before retracting it", async () => {
    getClaimGraph.mockResolvedValue({ claims: [claim()], bindings: [binding()] });
    getClaimsForSource.mockResolvedValue({ claims: [claim()] });

    panel();
    fireEvent.click(await screen.findByRole("button", { name: "Retract this source" }));

    expect(getClaimsForSource).toHaveBeenCalledWith("proj-1", "smith2020");
    // UX3: state the blast radius before it happens, not after.
    expect(await screen.findByText(/removes its evidence from 1 claim/)).toBeInTheDocument();
    // Named twice by design: once as the claim itself, once inside the warning.
    expect(screen.getAllByText(/Remote work reduces tacit knowledge sharing/).length).toBeGreaterThanOrEqual(2);
  });

  it("retracts only after the second, explicit confirmation", async () => {
    getClaimGraph.mockResolvedValueOnce({ claims: [claim()], bindings: [binding()] });
    getClaimsForSource.mockResolvedValue({ claims: [claim()] });
    removeSource.mockResolvedValue({ ...projectView(), claimGraph: emptyGraph() });

    panel();
    fireEvent.click(await screen.findByRole("button", { name: "Retract this source" }));
    await screen.findByText(/removes its evidence from/);

    expect(removeSource).not.toHaveBeenCalled();
    // The row's own retract button is hidden while its confirmation is open —
    // only the one inside the warning remains.
    expect(screen.getAllByRole("button", { name: "Retract this source" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Retract this source" }));

    await waitFor(() => expect(removeSource).toHaveBeenCalledWith("proj-1", "smith2020"));
  });

  it("can be abandoned without retracting anything", async () => {
    getClaimGraph.mockResolvedValue({ claims: [claim()], bindings: [binding()] });
    getClaimsForSource.mockResolvedValue({ claims: [claim()] });

    panel();
    fireEvent.click(await screen.findByRole("button", { name: "Retract this source" }));
    await screen.findByText(/removes its evidence from/);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(removeSource).not.toHaveBeenCalled();
  });
});
