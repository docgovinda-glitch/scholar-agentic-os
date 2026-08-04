// @vitest-environment jsdom
//
// Knowledge Vault setup (docs 25 §6).
//
// Two things here are safety-critical rather than cosmetic:
//
//   * The Recovery Kit step is NOT skippable, and Continue stays disabled
//     until the user confirms they saved the code. There is no second copy —
//     §6.3 says so in the wording, and this file makes it true in the code.
//   * The recovery code must be stable while it is on screen. A code that
//     regenerated on re-render would leave the user holding one that opens
//     nothing.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, renderHook, act } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const getUser = vi.fn();
const from = vi.fn();
vi.mock("../../services/supabaseClient", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseClient: () => ({ auth: { getUser }, from }),
}));

const { default: VaultSetupScreen } = await import("../setup/VaultSetupScreen");
const { useVaultSetupStatus } = await import("../setup/useVaultSetupStatus");
const { generateRecoveryCode, verifyVaultPassphrase, hasVaultPassphraseOnThisDevice } = await import(
  "../../services/userVault"
);

const USER = { id: "11111111-1111-4111-8111-111111111111" };
const upsert = vi.fn();

function noVaultYet() {
  from.mockReturnValue({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    upsert,
  });
}

beforeEach(() => {
  localStorage.clear();
  getUser.mockResolvedValue({ data: { user: USER } });
  upsert.mockResolvedValue({ error: null });
  noVaultYet();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** Walk the offer → passphrase → recovery path. */
async function reachRecoveryStep() {
  render(<VaultSetupScreen onDone={vi.fn()} onSkip={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: /Create a Vault/ }));
  fireEvent.change(screen.getByLabelText("Vault passphrase"), { target: { value: "correct horse" } });
  fireEvent.change(screen.getByLabelText("Confirm passphrase"), { target: { value: "correct horse" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByText(/Save your recovery code/i);
}

describe("recovery codes", () => {
  it("uses the specified format", () => {
    expect(generateRecoveryCode()).toMatch(/^SCHL(-[0-9A-Z]{4}){4}$/);
  });

  it("omits characters that are mistranscribed by hand", () => {
    // This code is copied off a printout at the moment it matters most, and a
    // 0/O confusion there is unrecoverable by design.
    //
    // Only the random groups are checked: the fixed "SCHL-" prefix contains an
    // L by design, and asserting over the whole string just matches that.
    const groups = Array.from({ length: 40 }, generateRecoveryCode)
      .flatMap((code) => code.split("-").slice(1))
      .join("");
    expect(groups).not.toMatch(/[ILOU]/);
  });

  it("does not repeat", () => {
    const codes = new Set(Array.from({ length: 50 }, generateRecoveryCode));
    expect(codes.size).toBe(50);
  });
});

describe("the offer", () => {
  it("presents declining as a peer option, not a lesser one", async () => {
    const onSkip = vi.fn();
    render(<VaultSetupScreen onDone={vi.fn()} onSkip={onSkip} />);

    fireEvent.click(await screen.findByRole("button", { name: "Not now" }));
    expect(onSkip).toHaveBeenCalled();
  });

  it("explains what a Vault is before asking for a decision", async () => {
    render(<VaultSetupScreen onDone={vi.fn()} onSkip={vi.fn()} />);
    expect(await screen.findByText(/long-term library/i)).toBeInTheDocument();
    expect(screen.getByText(/entirely optional/i)).toBeInTheDocument();
  });

  it("shows import as unavailable with a reason, not as a dead button", async () => {
    render(<VaultSetupScreen onDone={vi.fn()} onSkip={vi.fn()} />);
    await screen.findByText(/Import an existing library/i);

    // The importers do not exist anywhere in the codebase. A control that
    // looks live and does nothing is worse than an honest label.
    expect(screen.queryByRole("button", { name: /Import an existing library/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Not available yet/i)).toBeInTheDocument();
  });
});

describe("passphrase", () => {
  it("says plainly that it is not the account password", async () => {
    render(<VaultSetupScreen onDone={vi.fn()} onSkip={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /Create a Vault/ }));

    // Docs 25 §4: conflating the two is "a support disaster and a data-loss risk".
    expect(screen.getByText(/It is/)).toHaveTextContent(/not your account password/i);
  });

  it("blocks continuing while the two entries differ", async () => {
    render(<VaultSetupScreen onDone={vi.fn()} onSkip={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /Create a Vault/ }));

    fireEvent.change(screen.getByLabelText("Vault passphrase"), { target: { value: "correct horse" } });
    fireEvent.change(screen.getByLabelText("Confirm passphrase"), { target: { value: "correct hose" } });

    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(/do not match/i);
  });
});

describe("the Recovery Kit", () => {
  it("keeps Continue disabled until the user confirms they saved the code", async () => {
    await reachRecoveryStep();

    // §6.3: this step is not skippable.
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  it("states, unsoftened, that the code cannot be recovered", async () => {
    await reachRecoveryStep();
    expect(screen.getByText(/We do not have a copy\. We cannot reset it\./)).toBeInTheDocument();
  });

  it("keeps the same code on screen across re-renders", async () => {
    await reachRecoveryStep();
    const shown = screen.getByText(/^SCHL-/).textContent;

    // Re-render by toggling the checkbox twice.
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("checkbox"));

    // A regenerated code would leave the user holding one that opens nothing.
    expect(screen.getByText(/^SCHL-/).textContent).toBe(shown);
  });

  it("creates the Vault without sending the passphrase or the code", async () => {
    await reachRecoveryStep();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(upsert).toHaveBeenCalled());

    const row = upsert.mock.calls[0][0];
    expect(row.user_id).toBe(USER.id);
    // The promise in §6.3 is only true if neither ever reaches the server.
    const serialised = JSON.stringify(row);
    expect(serialised).not.toContain("correct horse");
    expect(serialised).not.toMatch(/SCHL-/);
  });

  it("records the passphrase verifier on the device only", async () => {
    await reachRecoveryStep();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(upsert).toHaveBeenCalled());

    expect(hasVaultPassphraseOnThisDevice()).toBe(true);
    expect(await verifyVaultPassphrase("correct horse")).toBe(true);
    expect(await verifyVaultPassphrase("wrong passphrase")).toBe(false);
    // A verifier, not the secret.
    expect(JSON.stringify(localStorage)).not.toContain("correct horse");
  });
});

describe("useVaultSetupStatus", () => {
  it("offers the Vault when the user has none", async () => {
    const { result } = renderHook(() => useVaultSetupStatus(USER.id, true));
    await waitFor(() => expect(result.current.status).toBe("offer"));
  });

  it("does not offer it while an earlier stage is unresolved", async () => {
    const { result } = renderHook(() => useVaultSetupStatus(USER.id, false));
    // Rendering two setup stages at once, or flashing this one, is the failure
    // being prevented.
    expect(result.current.status).toBe("checking");
  });

  it("does not re-offer once declined", async () => {
    const first = renderHook(() => useVaultSetupStatus(USER.id, true));
    await waitFor(() => expect(first.result.current.status).toBe("offer"));
    act(() => first.result.current.skip());

    const second = renderHook(() => useVaultSetupStatus(USER.id, true));
    await waitFor(() => expect(second.result.current.status).toBe("done"));
  });

  it("does not offer it when a Vault already exists on another device", async () => {
    from.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { label: "My Knowledge Vault", created_at: "2026-01-01" }, error: null }),
        }),
      }),
      upsert,
    });

    const { result } = renderHook(() => useVaultSetupStatus(USER.id, true));
    await waitFor(() => expect(result.current.status).toBe("done"));
  });
});
