// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";

// Mock dependencies
vi.mock("../desk/api", () => ({
  getProject: vi.fn().mockImplementation((id: string) => Promise.resolve({
    projectId: id,
    outputTypeId: id.includes("thesis") ? "OT-07" : id.includes("research") ? "OT-10" : id.includes("proposal") ? "OT-15" : id.includes("presentation") ? "OT-22" : "OT-01",
    title: "Test Project",
    hasDocument: false,
    answers: {},
    gates: [],
  })),
  listProjects: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  listOutputTypes: vi.fn().mockResolvedValue({ items: [] }),
  getOutputTypeSpec: vi.fn().mockResolvedValue({ id: "OT-01", label: "Assignment", structure: { sections: [] } }),
  getDocument: vi.fn().mockResolvedValue(null),
  getRubric: vi.fn().mockResolvedValue(null),
  saveIntakeAnswers: vi.fn().mockResolvedValue({}),
  authedFetch: vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
  authedJsonFetch: vi.fn().mockResolvedValue({}),
  isEphemeralProject: vi.fn().mockReturnValue(false),
  commitProjectToDatabase: vi.fn().mockImplementation(async (id: string) => ({ projectId: id, answers: {} })),
  setGlobalManualModelOverride: vi.fn(),
  UnauthenticatedError: class UnauthenticatedError extends Error {},
}));

vi.mock("../services/supabaseClient", () => ({
  getSupabaseClient: vi.fn().mockReturnValue({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: {
          session: {
            user: { id: "usr-1", email: "test@example.com" },
            access_token: "token",
          },
        },
      }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    }),
    removeChannel: vi.fn().mockResolvedValue({}),
  }),
  isSupabaseConfigured: vi.fn().mockReturnValue(true),
  resolveSupabaseUrl: vi.fn().mockReturnValue("https://mock.supabase.co"),
}));

vi.mock("../services/supabaseAuthService", () => ({
  getProfile: vi.fn().mockResolvedValue({ success: true, profile: { userType: "student", educationLevel: "undergraduate" } }),
  loadUserAiSettings: vi.fn().mockResolvedValue({ provider: "byok" }),
  syncActiveSessionToRegistry: vi.fn(),
}));

vi.mock("../services/userVault", () => ({
  loadVault: vi.fn().mockResolvedValue([]),
}));

vi.mock("../services/vault/cloudDriveService", () => ({
  getConnectedCloudDrives: vi.fn().mockResolvedValue([]),
}));

import DeskApp from "../desk/DeskApp";
import AssignmentWorkspace from "../desk/assignment/AssignmentWorkspace";
import ResearchWorkspace from "../desk/workspace/ResearchWorkspace";
import ThesisWorkspace from "../desk/thesis/ThesisWorkspace";
import ProposalWorkspace from "../desk/proposal/ProposalWorkspace";
import PresentationWorkspace from "../desk/presentation/PresentationWorkspace";
import DeskShell from "../desk/DeskShell";
import ProjectListScreen from "../desk/ProjectListScreen";

describe("Diagnose Maximum Call Stack Size Exceeded", () => {
  it("renders DeskApp at /", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <DeskApp />
      </MemoryRouter>
    );
  });

  it("renders DeskApp at /projects", () => {
    render(
      <MemoryRouter initialEntries={["/projects"]}>
        <DeskApp />
      </MemoryRouter>
    );
  });

  it("renders DeskApp at /projects/proj-1", () => {
    render(
      <MemoryRouter initialEntries={["/projects/proj-1"]}>
        <DeskApp />
      </MemoryRouter>
    );
  });

  it("renders DeskApp at /projects/proj-1/understand", () => {
    render(
      <MemoryRouter initialEntries={["/projects/proj-1/understand"]}>
        <DeskApp />
      </MemoryRouter>
    );
  });

  it("renders DeskApp at /projects/proj-1/sources", () => {
    render(
      <MemoryRouter initialEntries={["/projects/proj-1/sources"]}>
        <DeskApp />
      </MemoryRouter>
    );
  });

  it("renders DeskApp at /projects/proj-1/drafting", () => {
    render(
      <MemoryRouter initialEntries={["/projects/proj-1/drafting"]}>
        <DeskApp />
      </MemoryRouter>
    );
  });

  it("renders DeskApp at /projects/proj-1/submission", () => {
    render(
      <MemoryRouter initialEntries={["/projects/proj-1/submission"]}>
        <DeskApp />
      </MemoryRouter>
    );
  });

  it("renders AssignmentWorkspace directly", () => {
    render(
      <AssignmentWorkspace
        projectId="proj-assignment-1"
        initialStage="understand"
        onStageChange={vi.fn()}
      />
    );
  });

  it("renders ResearchWorkspace directly", () => {
    render(
      <ResearchWorkspace
        projectId="proj-research-1"
        initialStage={null}
        onStageChange={vi.fn()}
      />
    );
  });

  it("renders ThesisWorkspace directly", () => {
    render(
      <ThesisWorkspace
        projectId="proj-thesis-1"
      />
    );
  });

  it("renders ProposalWorkspace directly", () => {
    render(
      <ProposalWorkspace
        projectId="proj-proposal-1"
      />
    );
  });

  it("renders PresentationWorkspace directly", () => {
    render(
      <PresentationWorkspace
        projectId="proj-presentation-1"
      />
    );
  });

  it("renders DeskShell directly", () => {
    render(
      <DeskShell
        projectId="proj-shell-1"
        view={null}
        onViewChange={vi.fn()}
      />
    );
  });

  it("renders AssignmentWorkspace with problematic question directly", async () => {
    const api = await import("../desk/api");
    (api.getProject as any).mockResolvedValue({
      projectId: "proj-mismatch",
      outputTypeId: "OT-01",
      title: "Test",
      hasDocument: false,
      answers: {
        assignment_question: "The impact of X on Y",
      },
      gates: [],
    });

    const { screen } = await import("@testing-library/react");
    render(
      <AssignmentWorkspace
        projectId="proj-mismatch"
        initialStage="sources"
        onStageChange={vi.fn()}
      />
    );

    expect(await screen.findByText(/Sources & Course Materials/i)).toBeInTheDocument();
    // Auto-curation should have fired at most once, never in an infinite loop
    expect((api.saveIntakeAnswers as any).mock.calls.length).toBeLessThanOrEqual(2);
  });

  it("safely handles circular references in isDeepEqual without Maximum call stack size exceeded", async () => {
    const { isDeepEqual } = await import("../utils/briefExtractor");
    const objA: any = { name: "test" };
    objA.self = objA;
    const objB: any = { name: "test" };
    objB.self = objB;

    expect(() => isDeepEqual(objA, objB)).not.toThrow();
    expect(isDeepEqual(objA, objB)).toBe(true);
  });

  it("safely handles circular references in computeStateHash without Maximum call stack size exceeded", async () => {
    const { computeStateHash } = await import("../app/conductor/hash");
    const objA: any = { id: "G0", title: "Intake Gate" };
    objA.parent = objA;

    await expect(computeStateHash(objA)).resolves.toBeDefined();
    const hash = await computeStateHash(objA);
    expect(typeof hash).toBe("string");
    expect(hash.length).toBe(64);
  });

  it("safely handles circular references in proposeStructure without Maximum call stack size exceeded", async () => {
    const { proposeStructure } = await import("../app/atlas/proposals");
    const sec1: any = { key: "sec1", title: "Section 1", required: true };
    const sec2: any = { key: "sec2", title: "Section 2", required: true, children: [sec1] };
    sec1.children = [sec2]; // circular reference

    const spec: any = {
      budget: { totalWords: { typical: 2000 }, distribution: { sec1: 0.5, sec2: 0.5 } },
      structure: { sections: [sec1] },
      intakeSchema: { required: [], recommended: [], optional: [] },
    };

    expect(() => proposeStructure(spec)).not.toThrow();
  });

  it("safely formats tone and labels using safeFormatLabel without throwing TypeError: replace is not a function", async () => {
    const { safeFormatLabel } = await import("../utils/briefExtractor");
    expect(safeFormatLabel("formal_academic")).toBe("formal academic");
    expect(safeFormatLabel({ preset: "analytical", description: "test" })).toBe("analytical");
    expect(safeFormatLabel({ label: "Persuasive Tone" })).toBe("Persuasive Tone");
    expect(safeFormatLabel({ title: "Custom Title" })).toBe("Custom Title");
    expect(safeFormatLabel({ id: "critical" })).toBe("critical");
    expect(safeFormatLabel(null)).toBe("");
    expect(safeFormatLabel(undefined)).toBe("");
    expect(safeFormatLabel(2000)).toBe("2000");
  });

  it("renders AssignmentWorkspace safely when project.answers.writing_tone is an object", async () => {
    const api = await import("../desk/api");
    (api.getProject as any).mockResolvedValue({
      projectId: "proj-tone-obj",
      outputTypeId: "OT-01",
      title: "Tone Object Test",
      hasDocument: false,
      answers: {
        assignment_question: "Discuss the ramifications of artificial intelligence in jurisprudence.",
        academic_level: "undergraduate",
        assignment_type: "essay",
        citation_style: "apa7",
        writing_tone: { preset: "analytical", description: "Detailed analytical mode." },
        writingTone: { preset: "analytical", description: "Detailed analytical mode." },
        writing_style: { preset: "analytical", description: "Detailed analytical mode." },
      },
      gates: [],
    });

    const { screen } = await import("@testing-library/react");
    render(
      <AssignmentWorkspace
        projectId="proj-tone-obj"
        initialStage="understand"
        onStageChange={vi.fn()}
      />
    );

    expect(await screen.findByText(/Phase 1: Understand the Assignment Brief/i)).toBeInTheDocument();
  });
});

