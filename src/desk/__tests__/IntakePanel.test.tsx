// @vitest-environment jsdom
//
// Intake — the questions that gate everything else.
//
// G0's exit criteria are computed from these answers, and no later gate can be
// signed off while G0 is outstanding. Before this panel existed, Desk showed
// "50% of intake answered" with no way to answer, so the whole eight-gate
// workflow was unreachable.
//
// The assertions worth having are about the cases where the obvious
// implementation is subtly wrong: pre-filling that overwrites the user,
// guidance that is present but unreachable, and "I'm not sure yet" being a
// real recorded value rather than a blank.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const getOutputTypeSpec = vi.fn();
const saveIntakeAnswers = vi.fn();
vi.mock("../api", () => ({
  getOutputTypeSpec: (...a: unknown[]) => getOutputTypeSpec(...a),
  saveIntakeAnswers: (...a: unknown[]) => saveIntakeAnswers(...a),
}));

const { default: IntakePanel } = await import("../intake/IntakePanel");

const field = (over: Record<string, unknown> = {}) => ({
  key: "research_question",
  label: "Research question",
  tier: "required",
  guidance: {
    whatItIs: "The single question your work sets out to answer.",
    whyItMatters: "Everything else is judged against whether it answers this.",
    example: "Does remote work change how teams share tacit knowledge?",
    defaultWithRationale: "Left blank by default because only you can decide it.",
  },
  allowsProvisional: true,
  ...over,
});

const SPEC = {
  id: "OT-02",
  label: "Essay",
  family: "essay",
  intakeSchema: {
    required: [field()],
    recommended: [field({ key: "audience", label: "Audience", tier: "recommended", allowsProvisional: false })],
    optional: [],
  },
};

const project = (over: Record<string, unknown> = {}) => ({
  projectId: "proj-1",
  outputTypeId: "OT-02",
  answers: {},
  intakeCompleteness: 0,
  hasDocument: false,
  gates: [{ gate: "G0", name: "Intake", status: "in_progress", outstandingBlocking: ["Research question"] }],
  ...over,
});

beforeEach(() => {
  getOutputTypeSpec.mockResolvedValue(SPEC);
  saveIntakeAnswers.mockImplementation(async () => project({ intakeCompleteness: 1 }));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const panel = (p = project()) =>
  render(<IntakePanel projectId="proj-1" project={p as never} onSaved={vi.fn()} />);

describe("the questions", () => {
  it("renders required fields with real labels", async () => {
    panel();
    expect(await screen.findByLabelText(/Research question/)).toBeInTheDocument();
  });

  it("keeps optional questions collapsed behind a disclosure", async () => {
    panel();
    await screen.findByLabelText(/Research question/);

    // Showing them at equal weight would misrepresent what is actually being
    // asked of the user.
    expect(screen.queryByLabelText(/Audience/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Show 1 more question/ }));
    expect(screen.getByLabelText(/Audience/)).toBeInTheDocument();
  });

  it("says how many required questions remain, not just a percentage", async () => {
    panel();
    // UX5: name what is outstanding and what it blocks. A bare percentage
    // leaves the user to infer both.
    expect(await screen.findByText(/1 required question left before intake can be signed off/i)).toBeInTheDocument();
  });

  it("confirms when nothing is outstanding", async () => {
    panel(project({ answers: { research_question: "Does remote work change knowledge sharing?" } }));
    expect(await screen.findByText(/All required questions answered/i)).toBeInTheDocument();
  });
});

describe("guidance", () => {
  it("is reachable per field, and not shown until asked for", async () => {
    panel();
    await screen.findByLabelText(/Research question/);

    // Four paragraphs of prose around every text box is the wall this avoids;
    // absent entirely would waste the catalog's mandatory guidance contract.
    expect(screen.queryByText(/single question your work sets out to answer/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "What is this?" }));
    expect(screen.getByText(/single question your work sets out to answer/i)).toBeInTheDocument();
  });

  it("shows all four parts of the guidance contract", async () => {
    panel();
    await screen.findByLabelText(/Research question/);
    fireEvent.click(screen.getByRole("button", { name: "What is this?" }));

    // app/atlas/validate.ts enforces all four as mandatory on every field.
    // Carrying them and then showing two would waste that.
    expect(screen.getByText(/single question your work sets out to answer/i)).toBeInTheDocument();
    expect(screen.getByText(/judged against whether it answers this/i)).toBeInTheDocument();
    expect(screen.getByText(/tacit knowledge/i)).toBeInTheDocument();
    expect(screen.getByText(/only you can decide it/i)).toBeInTheDocument();
  });
});

describe("pre-filling", () => {
  it("uses the catalog default for an unanswered required field", async () => {
    getOutputTypeSpec.mockResolvedValue({
      ...SPEC,
      intakeSchema: { ...SPEC.intakeSchema, required: [field({ defaultValue: "Untitled essay" })] },
    });
    panel();

    // "Never an empty required field" (docs 14 §5.2).
    await waitFor(() => expect(screen.getByLabelText(/Research question/)).toHaveValue("Untitled essay"));
  });

  it("never overwrites an answer the user already has", async () => {
    getOutputTypeSpec.mockResolvedValue({
      ...SPEC,
      intakeSchema: { ...SPEC.intakeSchema, required: [field({ defaultValue: "Untitled essay" })] },
    });
    panel(project({ answers: { research_question: "My actual question" } }));

    // The pre-fill effect runs when the spec arrives, which is AFTER the
    // user's answers are already in state — clobbering them there would
    // silently discard real work.
    await screen.findByLabelText(/Research question/);
    expect(screen.getByLabelText(/Research question/)).toHaveValue("My actual question");
  });
});

describe("'I'm not sure yet'", () => {
  it("is offered only where the schema allows it", async () => {
    panel();
    await screen.findByLabelText(/Research question/);
    expect(screen.getByRole("button", { name: /I'm not sure yet/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Show 1 more question/ }));
    // `audience` sets allowsProvisional: false — offering it there would let a
    // user defer something the catalog says cannot be deferred.
    expect(screen.getAllByRole("button", { name: /I'm not sure yet/ })).toHaveLength(1);
  });

  it("records 'provisional' rather than leaving the field blank", async () => {
    panel();
    await screen.findByLabelText(/Research question/);

    fireEvent.click(screen.getByRole("button", { name: /I'm not sure yet/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save answers" }));

    // A blank would read as unanswered; "provisional" is a value the server
    // and computeG0ExitCriteria both understand as a deliberate deferral.
    await waitFor(() =>
      expect(saveIntakeAnswers).toHaveBeenCalledWith("proj-1", expect.objectContaining({ research_question: "provisional" }))
    );
  });

  it("can be undone", async () => {
    panel();
    await screen.findByLabelText(/Research question/);

    fireEvent.click(screen.getByRole("button", { name: /I'm not sure yet/ }));
    expect(screen.getByText(/Recorded as undecided/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /I know the answer now/ }));
    expect(screen.queryByText(/Recorded as undecided/i)).not.toBeInTheDocument();
  });
});

describe("saving", () => {
  it("sends the typed answers and reports success", async () => {
    panel();
    const input = await screen.findByLabelText(/Research question/);

    fireEvent.change(input, { target: { value: "Does remote work change knowledge sharing?" } });
    fireEvent.click(screen.getByRole("button", { name: "Save answers" }));

    await waitFor(() =>
      expect(saveIntakeAnswers).toHaveBeenCalledWith("proj-1", {
        research_question: "Does remote work change knowledge sharing?",
      })
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Saved");
  });

  it("hands the updated project back, so gates refresh without a re-fetch", async () => {
    const onSaved = vi.fn();
    const updated = project({ intakeCompleteness: 1, gates: [{ gate: "G0", name: "Intake", status: "ready", outstandingBlocking: [] }] });
    saveIntakeAnswers.mockResolvedValue(updated);

    render(<IntakePanel projectId="proj-1" project={project() as never} onSaved={onSaved} />);
    await screen.findByLabelText(/Research question/);
    fireEvent.click(screen.getByRole("button", { name: "Save answers" }));

    // Answering intake is what moves G0; the caller needs the new gate state.
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(updated));
  });

  it("allows a partial save rather than demanding every field", async () => {
    panel();
    await screen.findByLabelText(/Research question/);

    // The server merges, so saving early is safe. Disabling the button until
    // everything is filled would make that impossible and lose work.
    expect(screen.getByRole("button", { name: "Save answers" })).toBeEnabled();
  });

  it("surfaces a save failure as an announced error", async () => {
    saveIntakeAnswers.mockRejectedValue(new Error("Intake is already signed off."));
    panel();
    await screen.findByLabelText(/Research question/);

    fireEvent.click(screen.getByRole("button", { name: "Save answers" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Intake is already signed off.");
  });
});
