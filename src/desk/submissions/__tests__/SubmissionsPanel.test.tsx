// @vitest-environment jsdom
//
// Post-G6 submission tracking — add/list/update-status/delete against the
// server-persisted submissions sub-resource (server/routes/project.ts).

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const listSubmissions = vi.fn();
const addSubmission = vi.fn();
const updateSubmission = vi.fn();
const deleteSubmission = vi.fn();
vi.mock("../../api", () => ({
  listSubmissions: (...a: unknown[]) => listSubmissions(...a),
  addSubmission: (...a: unknown[]) => addSubmission(...a),
  updateSubmission: (...a: unknown[]) => updateSubmission(...a),
  deleteSubmission: (...a: unknown[]) => deleteSubmission(...a),
}));

const { default: SubmissionsPanel } = await import("../SubmissionsPanel");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function submission(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "sub-1",
    journalName: "Nature Machine Intelligence",
    submittedAt: "2026-01-01",
    status: "submitted",
    statusUpdatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("loading and empty state", () => {
  it("shows an empty state once loaded with nothing recorded", async () => {
    listSubmissions.mockResolvedValue({ submissions: [] });
    render(<SubmissionsPanel projectId="proj-1" />);
    expect(await screen.findByText(/No submissions yet/)).toBeInTheDocument();
  });

  it("surfaces a load failure as an announced error", async () => {
    listSubmissions.mockRejectedValue(new Error("Network down."));
    render(<SubmissionsPanel projectId="proj-1" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Network down.");
  });
});

describe("listing submissions", () => {
  it("renders a recorded submission with its journal, date, and status", async () => {
    listSubmissions.mockResolvedValue({ submissions: [submission()] });
    render(<SubmissionsPanel projectId="proj-1" />);

    expect(await screen.findByText("Nature Machine Intelligence")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /status for nature machine intelligence/i })).toHaveValue("submitted");
  });

  it("shows real stats computed from the list", async () => {
    listSubmissions.mockResolvedValue({
      submissions: [
        submission({ id: "s1", journalName: "Journal A", status: "accepted" }),
        submission({ id: "s2", journalName: "Journal B", status: "submitted" }),
      ],
    });
    render(<SubmissionsPanel projectId="proj-1" />);
    await screen.findByText("Journal A");

    expect(screen.getByLabelText("Total submissions")).toHaveTextContent("2");
    expect(screen.getByLabelText("Accepted submissions")).toHaveTextContent("1");
  });
});

describe("adding a submission", () => {
  it("requires a journal name before it can be added", async () => {
    listSubmissions.mockResolvedValue({ submissions: [] });
    render(<SubmissionsPanel projectId="proj-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "New submission" }));

    expect(screen.getByRole("button", { name: "Add submission" })).toBeDisabled();
  });

  it("sends the form fields and shows the returned list", async () => {
    listSubmissions.mockResolvedValue({ submissions: [] });
    addSubmission.mockResolvedValue({ submissions: [submission()] });
    render(<SubmissionsPanel projectId="proj-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "New submission" }));

    fireEvent.change(screen.getByLabelText(/Journal name/), { target: { value: "Nature Machine Intelligence" } });
    fireEvent.click(screen.getByRole("button", { name: "Add submission" }));

    await waitFor(() =>
      expect(addSubmission).toHaveBeenCalledWith(
        "proj-1",
        expect.objectContaining({ journalName: "Nature Machine Intelligence", status: "draft" })
      )
    );
    expect(await screen.findByText("Nature Machine Intelligence")).toBeInTheDocument();
  });

  it("surfaces a save failure as an announced error", async () => {
    listSubmissions.mockResolvedValue({ submissions: [] });
    addSubmission.mockRejectedValue(new Error("Journal name is required."));
    render(<SubmissionsPanel projectId="proj-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "New submission" }));

    fireEvent.change(screen.getByLabelText(/Journal name/), { target: { value: "Nature" } });
    fireEvent.click(screen.getByRole("button", { name: "Add submission" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Journal name is required.");
  });

  it("closes the form on Cancel without saving", async () => {
    listSubmissions.mockResolvedValue({ submissions: [] });
    render(<SubmissionsPanel projectId="proj-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "New submission" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByLabelText(/Journal name/)).not.toBeInTheDocument();
    expect(addSubmission).not.toHaveBeenCalled();
  });
});

describe("updating status", () => {
  it("patches the status when the select changes", async () => {
    listSubmissions.mockResolvedValue({ submissions: [submission()] });
    updateSubmission.mockResolvedValue({ submissions: [submission({ status: "under_review" })] });
    render(<SubmissionsPanel projectId="proj-1" />);
    await screen.findByText("Nature Machine Intelligence");

    fireEvent.change(screen.getByRole("combobox", { name: /status for nature machine intelligence/i }), {
      target: { value: "under_review" },
    });

    await waitFor(() => expect(updateSubmission).toHaveBeenCalledWith("proj-1", "sub-1", { status: "under_review" }));
  });
});

describe("deleting a submission", () => {
  it("removes it and reflects the returned list", async () => {
    listSubmissions.mockResolvedValue({ submissions: [submission()] });
    deleteSubmission.mockResolvedValue({ submissions: [] });
    render(<SubmissionsPanel projectId="proj-1" />);
    await screen.findByText("Nature Machine Intelligence");

    fireEvent.click(screen.getByRole("button", { name: /Delete submission to Nature Machine Intelligence/ }));

    await waitFor(() => expect(deleteSubmission).toHaveBeenCalledWith("proj-1", "sub-1"));
    await waitFor(() => expect(screen.queryByText("Nature Machine Intelligence")).not.toBeInTheDocument());
  });
});
