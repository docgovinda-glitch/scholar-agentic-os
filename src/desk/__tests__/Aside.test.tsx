// @vitest-environment jsdom
//
// Waiving a Rubric finding.
//
// The server's POST .../rubric/waive existed the whole time this session's
// Rubric work was underway — Aside rendered every non-passing finding
// read-only, with no action for the ones docs 31 §7 says should be
// waivable with a recorded reason.
//
// A `warn`-status finding is, by construction, always a waived `fail`
// (domain/compliance/types.ts's isEffectivelyWaived — no evaluator produces
// "warn" any other way), so these tests pin that a `warn` finding shows as
// already waived rather than offering the action again, and that a
// `blocking` finding never gets the action at all (the server 400s on it).

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const waiveFinding = vi.fn();
vi.mock("../api", () => ({
  waiveFinding: (...a: unknown[]) => waiveFinding(...a),
}));
const studioPanelSpy = vi.fn();
vi.mock("../regions/StudioPanel", () => ({
  default: (props: unknown) => {
    studioPanelSpy(props);
    return null;
  },
}));

const { default: Aside } = await import("../regions/Aside");

const finding = (over: Record<string, unknown> = {}) => ({
  ruleId: "word_count",
  status: "fail",
  severity: "required",
  message: "Below the minimum word count.",
  remedy: "Add more content.",
  ...over,
});

const rubric = (findings: Array<Record<string, unknown>>) => ({
  findings,
  blockingFailures: findings.filter((f) => f.severity === "blocking" && f.status === "fail"),
  requiredFailures: findings.filter((f) => f.severity === "required" && f.status === "fail"),
  advisoryFindings: findings.filter((f) => f.severity === "advisory"),
  readyForG6: false,
});

const projectView = () => ({
  projectId: "proj-1",
  outputTypeId: "OT-02",
  answers: {},
  intakeCompleteness: 1,
  hasDocument: true,
  gates: [],
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const panel = (rub: ReturnType<typeof rubric> | null, onChanged = vi.fn()) =>
  render(<Aside projectId="proj-1" rubric={rub as never} sessionId="desk-proj-1" onChanged={onChanged} />);

describe("Studio seed pass-through", () => {
  it("forwards studioSeedText/studioSeedToken straight through to StudioPanel", () => {
    render(
      <Aside
        projectId="proj-1"
        rubric={null}
        sessionId="desk-proj-1"
        onChanged={vi.fn()}
        studioSeedText="Generated section."
        studioSeedToken={3}
      />
    );
    expect(studioPanelSpy).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "desk-proj-1", seedText: "Generated section.", seedToken: 3 })
    );
  });
});

describe("what a finding offers", () => {
  it("offers to waive a required failure", () => {
    panel(rubric([finding()]));
    expect(screen.getByRole("button", { name: "Waive" })).toBeInTheDocument();
  });

  it("does not offer to waive a blocking failure", () => {
    panel(rubric([finding({ ruleId: "min_length", severity: "blocking" })]));
    // The server 400s on a blocking waive attempt by design — offering the
    // action anyway would be a button that only fails.
    expect(screen.queryByRole("button", { name: "Waive" })).not.toBeInTheDocument();
  });

  it("shows an already-waived finding as waived, not offered again", () => {
    panel(rubric([finding({ status: "warn" })]));
    expect(screen.getByText("Waived")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Waive" })).not.toBeInTheDocument();
  });

  it("does not show a passing or not-applicable finding", () => {
    panel(rubric([finding({ status: "pass" }), finding({ ruleId: "x", status: "not_applicable" })]));
    expect(screen.getByText("Nothing blocking you. Requirements are checked as you write.")).toBeInTheDocument();
  });
});

describe("waiving", () => {
  it("requires a reason before it will proceed", () => {
    panel(rubric([finding()]));
    fireEvent.click(screen.getByRole("button", { name: "Waive" }));

    // UX3: the server requires a reason too, so this is not client-side
    // theatre — a waiver is a recorded judgement call, not a dismissal.
    expect(screen.getByRole("button", { name: "Waive" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Why is this okay to waive/), { target: { value: "Supervisor approved." } });
    expect(screen.getByRole("button", { name: "Waive" })).toBeEnabled();
  });

  it("sends the rule id and the typed reason", async () => {
    waiveFinding.mockResolvedValue({ ...projectView(), rubric: rubric([finding({ status: "warn" })]) });
    panel(rubric([finding()]));

    fireEvent.click(screen.getByRole("button", { name: "Waive" }));
    fireEvent.change(screen.getByLabelText(/Why is this okay to waive/), { target: { value: "Supervisor approved." } });
    fireEvent.click(screen.getByRole("button", { name: "Waive" }));

    await waitFor(() => expect(waiveFinding).toHaveBeenCalledWith("proj-1", "word_count", "Supervisor approved."));
  });

  it("hands the updated project and rubric back to the caller", async () => {
    const onChanged = vi.fn();
    const updated = { ...projectView(), rubric: rubric([finding({ status: "warn" })]) };
    waiveFinding.mockResolvedValue(updated);

    panel(rubric([finding()]), onChanged);
    fireEvent.click(screen.getByRole("button", { name: "Waive" }));
    fireEvent.change(screen.getByLabelText(/Why is this okay to waive/), { target: { value: "Supervisor approved." } });
    fireEvent.click(screen.getByRole("button", { name: "Waive" }));

    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(updated, updated.rubric));
  });

  it("surfaces a waive failure as an announced error", async () => {
    waiveFinding.mockRejectedValue(new Error("Rule is blocking severity and cannot be waived."));
    panel(rubric([finding()]));

    fireEvent.click(screen.getByRole("button", { name: "Waive" }));
    fireEvent.change(screen.getByLabelText(/Why is this okay to waive/), { target: { value: "Reason." } });
    fireEvent.click(screen.getByRole("button", { name: "Waive" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Rule is blocking severity and cannot be waived.");
  });

  it("can be cancelled without waiving anything", () => {
    panel(rubric([finding()]));
    fireEvent.click(screen.getByRole("button", { name: "Waive" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByLabelText(/Why is this okay to waive/)).not.toBeInTheDocument();
    expect(waiveFinding).not.toHaveBeenCalled();
  });
});
