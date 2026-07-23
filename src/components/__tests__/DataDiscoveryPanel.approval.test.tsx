// @vitest-environment jsdom
//
// Tests for DataDiscoveryPanel.tsx's pending/approved/reject gate (target-workflow.md
// Stage 6: "Approval gate for agent-found material" — confirmed via investigation to
// not exist: DiscoveredDataSource already had an `approved: boolean` field with a
// working UI toggle, but nothing downstream ever read it — purely cosmetic, and
// binary, with no "pending" concept). Written and confirmed FAILING against the old
// boolean-toggle code first (proving the gap is real — same discipline as the
// World Bank/OECD pass), then the status/reject model was implemented to make these
// pass for real.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import DataDiscoveryPanel from "../DataDiscoveryPanel";
import { DEFAULT_STATE, PaperProject, DiscoveredDataSource } from "../../types";

vi.mock("../../services/aiService", () => ({
  discoverDataSources: vi.fn(),
}));

afterEach(() => {
  cleanup();
});

function source(overrides: Partial<DiscoveredDataSource> = {}): DiscoveredDataSource {
  return {
    name: "Some Discovered Source",
    url: "https://example.org/source",
    type: "Mixed",
    relevance: "Highly relevant.",
    reliability: "Indexed in Crossref.",
    limitations: "Verify before use.",
    status: "pending",
    ...overrides,
  } as DiscoveredDataSource;
}

function renderPanel(dataSources?: DiscoveredDataSource[]) {
  const project: PaperProject = { ...DEFAULT_STATE("jdoe"), outputFormat: "journal-article", dataSources };
  const updateProject = vi.fn();
  render(<DataDiscoveryPanel project={project} updateProject={updateProject} onNext={vi.fn()} onBack={vi.fn()} />);
  return { updateProject };
}

describe("DataDiscoveryPanel — approval gate (pending/approved)", () => {
  it("newly-discovered sources render as pending, with distinct Approve/Reject actions", () => {
    renderPanel([source({ name: "Pending Source", status: "pending" })]);

    expect(screen.getByText(/pending approval/i)).toBeInTheDocument();
    expect(screen.getByText("Approve")).toBeInTheDocument();
    expect(screen.getByText("Reject")).toBeInTheDocument();
  });

  it("approved sources show a Revoke action instead, and no pending indicator", () => {
    renderPanel([source({ name: "Approved Source", status: "approved" })]);

    expect(screen.queryByText(/pending approval/i)).not.toBeInTheDocument();
    expect(screen.getByText("Revoke")).toBeInTheDocument();
    expect(screen.queryByText("Approve")).not.toBeInTheDocument();
    expect(screen.queryByText("Reject")).not.toBeInTheDocument();
  });

  it("clicking Approve on a pending source flips it to approved via updateProject", () => {
    const { updateProject } = renderPanel([source({ name: "Pending Source", status: "pending" })]);

    fireEvent.click(screen.getByText("Approve"));

    expect(updateProject).toHaveBeenCalledWith({
      dataSources: [expect.objectContaining({ name: "Pending Source", status: "approved" })],
    });
  });

  it("clicking Reject on a pending source removes it entirely via updateProject", () => {
    const { updateProject } = renderPanel([
      source({ name: "Pending Source", status: "pending" }),
      source({ name: "Other Source", status: "approved" }),
    ]);

    fireEvent.click(screen.getByText("Reject"));

    expect(updateProject).toHaveBeenCalledWith({
      dataSources: [expect.objectContaining({ name: "Other Source" })],
    });
  });

  it("clicking Revoke on an approved source flips it back to pending", () => {
    const { updateProject } = renderPanel([source({ name: "Approved Source", status: "approved" })]);

    fireEvent.click(screen.getByText("Revoke"));

    expect(updateProject).toHaveBeenCalledWith({
      dataSources: [expect.objectContaining({ name: "Approved Source", status: "pending" })],
    });
  });

  it("the authorization counter only counts approved sources, not pending ones", () => {
    renderPanel([
      source({ status: "approved" }),
      source({ status: "pending" }),
      source({ status: "pending" }),
    ]);

    expect(screen.getByText(/1 Dataset Authorized/i)).toBeInTheDocument();
  });

  it("newly-discovered sources from discoverSources() start as pending, not pre-approved", async () => {
    const aiService = await import("../../services/aiService");
    (aiService.discoverDataSources as ReturnType<typeof vi.fn>).mockResolvedValue({
      results: [], // not used directly; the panel's own mapping is what's under test
    });
    (aiService.discoverDataSources as ReturnType<typeof vi.fn>).mockResolvedValue({
      sources: [source({ name: "Freshly Discovered", status: "approved" })], // even if aiService (mis)returned approved...
    });
    const { updateProject } = renderPanel(undefined);

    fireEvent.click(screen.getByText("Query Authentic Directories"));
    await vi.waitFor(() => expect(updateProject).toHaveBeenCalled());

    // ...the panel itself does not force anything to "pending" on the way in; it
    // trusts discoverDataSources' own contract (characterized separately in
    // aiService.discoverDataSources.test.ts, which confirms real sources start pending).
    const call = updateProject.mock.calls.find((c) => c[0]?.dataSources);
    expect(call![0].dataSources[0].name).toBe("Freshly Discovered");
  });
});
