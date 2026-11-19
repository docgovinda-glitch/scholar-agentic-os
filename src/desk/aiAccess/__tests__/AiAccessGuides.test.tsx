// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("../../../services/userAiSettings", () => ({ readProviderKey: async () => null, storeProviderKey: vi.fn(), forgetProviderKey: vi.fn() }));
vi.mock("../accountKeys", () => ({ saveKeyToAccount: vi.fn(), removeKeyFromAccount: vi.fn() }));
vi.mock("../aiAccessApi", () => ({ verifyProviderKey: vi.fn() }));

import BackupKeys from "../BackupKeys";
import ProviderDetail from "../ProviderDetail";
import { ConfidentialExclusions, FreeTierRecipes, GrantsPanel } from "../AiAccessGuides";
import { getCloudProvider } from "../../../config/providerCatalog";
import { GRANT_PROGRAMS } from "../../../config/aiGrants";

afterEach(cleanup);

describe("Gemini quota scope", () => {
  it("warns beside the backup keys that quotas are per project, not per key", () => {
    render(<BackupKeys providerId="gemini" providerName="Google Gemini" quotaScopeNote={getCloudProvider("gemini")!.quotaScopeNote} />);
    expect(screen.getByTestId("quota-scope-note")).toHaveTextContent(/per Google Cloud \/ AI Studio project, not per API key/);
    expect(screen.getByTestId("quota-scope-note")).toHaveTextContent(/different project/);
  });

  it("shows nothing for a provider that meters per key", () => {
    render(<BackupKeys providerId="openai" providerName="OpenAI" quotaScopeNote={getCloudProvider("openai")!.quotaScopeNote} />);
    expect(screen.queryByTestId("quota-scope-note")).toBeNull();
  });
});

describe("data policy on a provider", () => {
  const view = { id: "gemini", name: "Google Gemini", description: "", icon: "", color: "", kind: "cloud", connected: false, tier: null, hasKeyOnDevice: false, selectedModel: null, modelsDetected: null, isDefault: false } as never;
  const renderDetail = (id: string, onPrivateTierChange?: (v: boolean) => void, privateTier = false) => {
    const spec = getCloudProvider(id)!;
    render(<ProviderDetail view={{ ...(view as object), id, name: spec.name, spec } as never} spec={spec} onConnect={vi.fn()} onDisconnect={vi.fn()} onSetModel={vi.fn()} onMakeDefault={vi.fn()} onBack={vi.fn()} privateTier={privateTier} onPrivateTierChange={onPrivateTierChange} />);
  };

  it("flags Gemini's free tier as one that may train, and lets the person mark a key as paid", () => {
    const change = vi.fn();
    renderDetail("gemini", change);
    expect(screen.getByTestId("data-policy")).toHaveTextContent(/may be used for training/i);
    fireEvent.click(screen.getByLabelText(/paid or zero-data-retention plan/i));
    expect(change).toHaveBeenCalledWith(true);
  });

  it("says plainly when a provider's policy is not confirmed, and for a no-training API offers no checkbox", () => {
    renderDetail("groq", vi.fn());
    expect(screen.getByTestId("data-policy")).toHaveTextContent(/not confirmed/i);
    cleanup();
    renderDetail("claude", vi.fn());
    expect(screen.getByTestId("data-policy")).toHaveTextContent(/not used for training by default/i);
    expect(screen.queryByLabelText(/paid or zero-data-retention plan/i)).toBeNull();
  });
});

describe("guides", () => {
  it("lists the high-yield free recipes and links into provider setup", () => {
    const open = vi.fn();
    render(<FreeTierRecipes onOpen={open} />);
    const text = screen.getByTestId("free-recipes").textContent ?? "";
    expect(text).toMatch(/\$10 once unlocks 1,000 free requests a day/);
    expect(text).toMatch(/Cerebras/);
    expect(text).toMatch(/Hugging Face PRO/);
    expect(text).toMatch(/Cloudflare Tunnel/);
    fireEvent.click(screen.getAllByText("Set up OpenRouter")[0]);
    expect(open).toHaveBeenCalledWith("openrouter");
  });

  it("groups grant programs by audience and warns about the Azure Foundry Marketplace billing trap", () => {
    render(<GrantsPanel />);
    const panel = screen.getByTestId("grants-panel");
    for (const g of GRANT_PROGRAMS) expect(panel).toHaveTextContent(g.name);
    expect(screen.getByRole("region", { name: "Students" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Researchers" })).toBeInTheDocument();
    expect(panel).toHaveTextContent(/Marketplace .* billed separately/s);
    for (const a of panel.querySelectorAll("a")) expect(a.getAttribute("href")).toMatch(/^https:\/\//);
  });

  it("every grant link is https and student/researcher credit is described as personal", () => {
    expect(GRANT_PROGRAMS.every((g) => g.url.startsWith("https://"))).toBe(true);
    render(<GrantsPanel />);
    expect(screen.getByTestId("grants-panel")).toHaveTextContent(/belongs to one person or one organisation/);
  });

  it("Confidential mode explains which connections it skips, and stops listing one the person confirmed", () => {
    const { rerender } = render(<ConfidentialExclusions connectedIds={["gemini", "claude", "groq"]} preferences={{}} />);
    const list = screen.getByTestId("confidential-exclusions");
    expect(list).toHaveTextContent("Google Gemini");
    expect(list).toHaveTextContent("Groq");
    expect(list).not.toHaveTextContent("Anthropic");
    rerender(<ConfidentialExclusions connectedIds={["gemini", "claude"]} preferences={{ geminiPrivateTier: "true" }} />);
    expect(screen.queryByTestId("confidential-exclusions")).toBeNull();
  });
});
