// @vitest-environment jsdom
/**
 * Moving between phases changes the URL (and so `initialStage`) and gives the
 * provider a new stage callback. Neither may refetch the project: a reload
 * showed the loading skeleton and unmounted the stage on every phase move.
 */
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, waitFor, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { AssignmentProvider, useAssignmentWorkspace } from "../AssignmentContext";

const getProject = vi.fn();

vi.mock("../../api", () => ({
  getProject: (...a: unknown[]) => getProject(...a),
  getDocument: vi.fn().mockResolvedValue(null),
  getRubric: vi.fn().mockResolvedValue(null),
  getOutputTypeSpec: vi.fn().mockResolvedValue({ id: "OT-01" }),
  saveIntakeAnswers: vi.fn().mockResolvedValue({ success: true }),
  authedFetch: vi.fn(),
  authedJsonFetch: vi.fn(),
  isEphemeralProject: () => false,
  commitProjectToDatabase: vi.fn(),
}));
vi.mock("../../../services/userVault", () => ({ loadVault: vi.fn().mockResolvedValue([]) }));
vi.mock("../../../services/vault/cloudDriveService", () => ({ getConnectedCloudDrives: vi.fn().mockResolvedValue([]) }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const mounts = { count: 0 };
function Probe() {
  const { isLoading } = useAssignmentWorkspace();
  React.useEffect(() => {
    mounts.count += 1;
  }, []);
  return isLoading ? <p>loading</p> : <p>ready</p>;
}

describe("phase navigation", () => {
  it("does not reload the project or unmount the stage when the phase changes", async () => {
    getProject.mockResolvedValue({ projectId: "p-nav", outputTypeId: "OT-01", hasDocument: false, answers: { assignment_brief: "Evaluate X." }, gates: [] });
    mounts.count = 0;
    const view = (stage: "extract" | "understand" | "sources", cb = vi.fn()) => (
      <AssignmentProvider projectId="p-nav" initialStage={stage} onStageChangeCallback={cb}>
        <Probe />
      </AssignmentProvider>
    );
    const { rerender, findByText } = render(view("extract"));
    await findByText("ready");
    expect(getProject).toHaveBeenCalledTimes(1);

    rerender(view("understand"));
    rerender(view("sources"));
    await findByText("ready");
    await waitFor(() => expect(getProject).toHaveBeenCalledTimes(1));
    expect(mounts.count).toBe(1);
  });
});
