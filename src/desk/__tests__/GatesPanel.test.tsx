// @vitest-environment jsdom
//
// Gate sign-off.
//
// `isReadyToSignOff` is `entrySatisfied && every blocking exit criterion
// satisfied` — two different failures needing two different answers. A gate
// blocked on its own exit criteria can be unblocked by working on it; a gate
// blocked on entry prerequisites cannot, and telling the user "no blockers"
// there would strand them in front of a button that 409s.
//
// GateSummary does not carry entrySatisfied, so the panel infers it from
// status. These tests pin that inference, because it is the kind of thing a
// later refactor breaks silently.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const signOffGate = vi.fn();
const invalidateGate = vi.fn();
vi.mock("../api", () => ({
  signOffGate: (...a: unknown[]) => signOffGate(...a),
  invalidateGate: (...a: unknown[]) => invalidateGate(...a),
}));

const { default: GatesPanel } = await import("../gates/GatesPanel");

const gate = (over: Record<string, unknown> = {}) => ({
  gate: "G0",
  name: "Intake",
  status: "ready",
  outstandingBlocking: [],
  ...over,
});

const project = (gates: Array<Record<string, unknown>>) => ({
  projectId: "proj-1",
  outputTypeId: "OT-02",
  answers: {},
  intakeCompleteness: 1,
  hasDocument: false,
  gates,
});

const panel = (gates: Array<Record<string, unknown>>, onChanged = vi.fn()) =>
  render(
    <GatesPanel
      projectId="proj-1"
      project={project(gates) as never}
      actor="scholar@example.com"
      onChanged={onChanged}
    />
  );

beforeEach(() => {
  signOffGate.mockResolvedValue(project([gate({ status: "signed_off" })]));
  invalidateGate.mockResolvedValue(project([gate({ status: "invalidated" })]));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("what a gate says about itself", () => {
  it("offers sign-off when nothing is outstanding", () => {
    panel([gate({ status: "ready" })]);
    expect(screen.getByRole("button", { name: "Sign off G0" })).toBeInTheDocument();
  });

  it("names the outstanding criteria instead of just refusing", () => {
    panel([gate({ status: "in_progress", outstandingBlocking: ["Research question is required"] })]);

    // UX5: state what is blocking and what would unblock it.
    expect(screen.getByText(/Research question is required/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign off G0" })).not.toBeInTheDocument();
  });

  it("distinguishes 'waiting on an earlier gate' from 'work outstanding here'", () => {
    // not_started means entry prerequisites are unmet — initialProjectGateState
    // marks only G0 entry-satisfied, and signOffGate promotes a gate out of
    // not_started as soon as its prerequisites are met.
    panel([gate({ gate: "G3", name: "Structure", status: "not_started", outstandingBlocking: [] })]);

    expect(screen.getByText(/Opens once the stages before it are signed off/i)).toBeInTheDocument();
    // No listed blockers AND no button: offering one here would 409.
    expect(screen.queryByRole("button", { name: /Sign off/ })).not.toBeInTheDocument();
  });

  it("does not offer sign-off for a gate already signed off", () => {
    panel([gate({ status: "signed_off" })]);
    expect(screen.queryByRole("button", { name: "Sign off G0" })).not.toBeInTheDocument();
  });

  it("states status in words, not colour alone", () => {
    panel([gate({ status: "ready" })]);
    // 21 §5.2 — meaning is never carried by colour alone.
    expect(screen.getByText("Ready to sign off")).toBeInTheDocument();
  });
});

describe("signing off", () => {
  it("attributes the sign-off to the signed-in user", async () => {
    panel([gate({ status: "ready" })]);
    fireEvent.click(screen.getByRole("button", { name: "Sign off G0" }));

    // Signing off is an accountable act; the gate records who did it.
    await waitFor(() => expect(signOffGate).toHaveBeenCalledWith("proj-1", "G0", "scholar@example.com"));
  });

  it("hands the updated project back so later gates open without a re-fetch", async () => {
    const onChanged = vi.fn();
    const updated = project([gate({ status: "signed_off" })]);
    signOffGate.mockResolvedValue(updated);

    panel([gate({ status: "ready" })], onChanged);
    fireEvent.click(screen.getByRole("button", { name: "Sign off G0" }));

    // signOffGate promotes newly-unblocked gates server-side; the caller needs
    // that state, not a stale copy.
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(updated));
  });

  it("surfaces a 409 rather than failing silently", async () => {
    signOffGate.mockRejectedValue(new Error("Gate G0 is not ready to sign off: research_question."));
    panel([gate({ status: "ready" })]);

    fireEvent.click(screen.getByRole("button", { name: "Sign off G0" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/not ready to sign off/);
  });
});

describe("reopening", () => {
  it("requires a reason before it will proceed", async () => {
    panel([gate({ status: "signed_off" })]);
    fireEvent.click(screen.getByRole("button", { name: "Reopen this stage" }));

    // UX3: deliberate friction at a consequential decision. This discards
    // approvals downstream, and the server requires the reason too — the
    // disabled button is not client-side theatre.
    expect(screen.getByRole("button", { name: "Reopen" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Why\?/), { target: { value: "Supervisor changed the question" } });
    expect(screen.getByRole("button", { name: "Reopen" })).toBeEnabled();
  });

  it("warns that reopening cascades before asking for confirmation", () => {
    panel([gate({ status: "signed_off" })]);
    fireEvent.click(screen.getByRole("button", { name: "Reopen this stage" }));

    expect(screen.getByText(/also reopens every stage that depended on it/i)).toBeInTheDocument();
  });

  it("sends the reason", async () => {
    panel([gate({ status: "signed_off" })]);
    fireEvent.click(screen.getByRole("button", { name: "Reopen this stage" }));
    fireEvent.change(screen.getByLabelText(/Why\?/), { target: { value: "Supervisor changed the question" } });
    fireEvent.click(screen.getByRole("button", { name: "Reopen" }));

    await waitFor(() =>
      expect(invalidateGate).toHaveBeenCalledWith("proj-1", "G0", "Supervisor changed the question")
    );
  });

  it("can be abandoned without reopening anything", () => {
    panel([gate({ status: "signed_off" })]);
    fireEvent.click(screen.getByRole("button", { name: "Reopen this stage" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByLabelText(/Why\?/)).not.toBeInTheDocument();
    expect(invalidateGate).not.toHaveBeenCalled();
  });
});

describe("the whole sequence", () => {
  it("shows every gate in order", () => {
    panel([
      gate({ gate: "G0", name: "Intake", status: "signed_off" }),
      gate({ gate: "G1", name: "Requirements", status: "in_progress", outstandingBlocking: ["x"] }),
      gate({ gate: "G2", name: "Sources", status: "not_started" }),
    ]);

    // Direct children only — a row with outstanding blockers renders its own
    // nested list, whose items also have role "listitem".
    const gateList = screen.getByRole("list", { name: "Gates" });
    const items = Array.from(gateList.children);
    expect(items).toHaveLength(3);
    // The order is the workflow; rendering it unordered would misrepresent it.
    expect(items[0]).toHaveTextContent("Intake");
    expect(items[2]).toHaveTextContent("Sources");
  });
});
