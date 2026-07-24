// @vitest-environment jsdom
//
// Stage 2 (target-workflow.md) — 5-tier BYOK AI configuration UI
// (docs/planning/ai-gateway.md). Characterization tests lock in the
// existing (pre-tier-gate) provider-selection step first, then new tests
// cover the added tier-selection gate.
//
// jsdom's window.localStorage isn't aliased onto globalThis by default in
// this jsdom/vitest combination — same quirk worked around in
// AIControlCenter.test.tsx.
Object.defineProperty(globalThis, "localStorage", {
  value: (globalThis as any).jsdom.window.localStorage,
  configurable: true,
});

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import AISetupWizard from "../AISetupWizard";
import { DEFAULT_STATE, PaperProject } from "../../types";
import AIGateway from "../../services/aiGateway";

vi.mock("../../services/aiGateway", async () => {
  const actual = await vi.importActual<typeof import("../../services/aiGateway")>("../../services/aiGateway");
  return {
    ...actual,
    default: {
      ...actual.default,
      detectLocalServers: vi.fn().mockResolvedValue({
        ollama: { provider: "ollama", status: "offline" },
        custom: { provider: "custom", status: "offline" },
      }),
      healthCheckProvider: vi.fn(),
      healthCheckAll: vi.fn(),
      getOllamaModels: vi.fn().mockResolvedValue([]),
    },
  };
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function renderWizard(overrides: Partial<PaperProject> = {}) {
  const project: PaperProject = { ...DEFAULT_STATE("jdoe"), ...overrides };
  render(
    <AISetupWizard
      project={project}
      updateProject={vi.fn()}
      onComplete={vi.fn()}
      passcodeHash="test-hash"
    />
  );
}

describe("AISetupWizard — Stage 2 tier-selection gate", () => {
  it("shows the tier-selection screen first, before any provider list", async () => {
    renderWizard();

    expect(await screen.findByText(/choose your ai access tier/i)).toBeInTheDocument();
    expect(screen.queryByText("Cloud AI Providers")).not.toBeInTheDocument();
    expect(screen.queryByText("Local AI Servers")).not.toBeInTheDocument();
  });

  it("selecting the Local Router tier advances to the provider step showing only local providers", async () => {
    renderWizard();
    await screen.findByText(/choose your ai access tier/i);

    fireEvent.click(screen.getByText(/local router/i));

    expect(await screen.findByText("Local AI Servers")).toBeInTheDocument();
    expect(screen.queryByText("Cloud AI Providers")).not.toBeInTheDocument();
    expect(screen.getByText("Ollama (Local)")).toBeInTheDocument();
  });

  it("selecting the Free-Tier BYOK tier shows only freemium cloud providers", async () => {
    renderWizard();
    await screen.findByText(/choose your ai access tier/i);

    fireEvent.click(screen.getByText(/free-tier byok/i));

    expect(await screen.findByText("Cloud AI Providers")).toBeInTheDocument();
    expect(screen.queryByText("Local AI Servers")).not.toBeInTheDocument();
    expect(screen.getByText("Google Gemini")).toBeInTheDocument();
    expect(screen.queryByText("OpenAI GPT")).not.toBeInTheDocument();
  });

  it("selecting the Heavy BYOK tier shows only paid cloud providers", async () => {
    renderWizard();
    await screen.findByText(/choose your ai access tier/i);

    fireEvent.click(screen.getByText(/heavy byok/i));

    expect(await screen.findByText("Cloud AI Providers")).toBeInTheDocument();
    expect(screen.getByText("OpenAI GPT")).toBeInTheDocument();
    expect(screen.getByText("Anthropic Claude")).toBeInTheDocument();
    expect(screen.queryByText("Google Gemini")).not.toBeInTheDocument();
  });

  it("shows the affiliate-subscription tier as an informational, non-selectable card (Tier 4 is not a technical flow here)", async () => {
    renderWizard();
    await screen.findByText(/choose your ai access tier/i);

    const affiliateCard = screen.getByText(/affiliate/i).closest("div");
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
    fireEvent.click(affiliateCard!);
    // Should not navigate away from the tier screen
    expect(screen.getByText(/choose your ai access tier/i)).toBeInTheDocument();
  });

  it("provides a way back to the tier screen from the provider step", async () => {
    renderWizard();
    await screen.findByText(/choose your ai access tier/i);
    fireEvent.click(screen.getByText(/local router/i));
    await screen.findByText("Local AI Servers");

    fireEvent.click(screen.getByText(/change tier/i));

    expect(await screen.findByText(/choose your ai access tier/i)).toBeInTheDocument();
  });
});

describe("AISetupWizard — provider-selection step (characterization, unchanged once a tier is picked)", () => {
  it("still requires at least one provider selected before 'Configure Providers' is enabled", async () => {
    renderWizard();
    await screen.findByText(/choose your ai access tier/i);
    fireEvent.click(screen.getByText(/heavy byok/i));
    await screen.findByText("Cloud AI Providers");

    const configureButton = screen.getByText(/configure providers/i).closest("button")!;
    expect(configureButton).toBeDisabled();

    fireEvent.click(screen.getByText("OpenAI GPT"));
    expect(configureButton).not.toBeDisabled();
  });
});
