// @vitest-environment jsdom
//
// The Vault's contents (docs 25 §6) — reached from "Vault" in the header.
//
// Three states, in order, and each one is a real gate, not cosmetic: no
// Vault yet reuses VaultSetupScreen's own create flow rather than a second
// one; locked can only be crossed with the right passphrase, verified
// against userVault.ts's device-local verifier; unlocked is where items
// actually live. The passphrase itself is asserted to never leave
// vaultContents.ts's in-memory cache — these tests check the DOM and the
// mocked service calls, never the plaintext value going anywhere else.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const loadVault = vi.fn();
const hasVaultPassphraseOnThisDevice = vi.fn();
vi.mock("../../services/userVault", async () => {
  const actual = await vi.importActual<typeof import("../../services/userVault")>("../../services/userVault");
  return {
    ...actual,
    loadVault: (...a: unknown[]) => loadVault(...a),
    hasVaultPassphraseOnThisDevice: (...a: unknown[]) => hasVaultPassphraseOnThisDevice(...a),
  };
});

const unlockVault = vi.fn();
const lockVault = vi.fn();
const isVaultUnlocked = vi.fn();
const listVaultItems = vi.fn();
const addVaultItem = vi.fn();
const deleteVaultItem = vi.fn();
vi.mock("../../services/vaultContents", async () => {
  const actual = await vi.importActual<typeof import("../../services/vaultContents")>("../../services/vaultContents");
  return {
    ...actual,
    unlockVault: (...a: unknown[]) => unlockVault(...a),
    lockVault: (...a: unknown[]) => lockVault(...a),
    isVaultUnlocked: (...a: unknown[]) => isVaultUnlocked(...a),
    listVaultItems: (...a: unknown[]) => listVaultItems(...a),
    addVaultItem: (...a: unknown[]) => addVaultItem(...a),
    deleteVaultItem: (...a: unknown[]) => deleteVaultItem(...a),
  };
});

// VaultSetupScreen pulls in the recovery-code flow; keep it real (not
// mocked) so the "no Vault yet" test exercises the actual reused component,
// but its own dependencies still need the same userVault mock above.
const { default: VaultScreen } = await import("../vault/VaultScreen");

const item = (over: Partial<{ id: string; title: string; content: string; citation?: string; createdAt: string }> = {}) => ({
  id: "item-1",
  title: "Longitudinal effects of microplastics",
  content: "Key finding was a measurable decline in invertebrate populations.",
  citation: "Zhang & Petrova, 2019",
  createdAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

beforeEach(() => {
  isVaultUnlocked.mockReturnValue(false);
  // Default: vault exists on this device (the normal case for most tests).
  hasVaultPassphraseOnThisDevice.mockResolvedValue(true);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("no Vault yet", () => {
  it("offers to create one, reusing the setup flow", async () => {
    loadVault.mockResolvedValue(null);
    render(<VaultScreen userId="user-1" onClose={vi.fn()} />);

    expect(await screen.findByText(/long-term library/i)).toBeInTheDocument();
  });

  it("returning without creating one just closes, without recording an onboarding skip", async () => {
    loadVault.mockResolvedValue(null);
    const onClose = vi.fn();
    render(<VaultScreen userId="user-1" onClose={onClose} />);

    fireEvent.click(await screen.findByRole("button", { name: "Not now" }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("Vault exists on another browser (P1-4: cross-device absence)", () => {
  it("shows an explanation instead of the create-vault flow when the vault is on another device", async () => {
    loadVault.mockResolvedValue({ label: "My Knowledge Vault", createdAt: "2026-01-01" });
    hasVaultPassphraseOnThisDevice.mockResolvedValue(false);
    render(<VaultScreen userId="user-1" onClose={vi.fn()} />);

    expect(await screen.findByText(/Your Vault is on another browser/i)).toBeInTheDocument();
    // Must NOT show the create-vault flow
    expect(screen.queryByText(/long-term library/i)).not.toBeInTheDocument();
    // Must show the Projects vs Vault explanation
    expect(screen.getByText(/Projects.*Synced to your Scholar account/is)).toBeInTheDocument();
  });
});

describe("locked", () => {
  it("asks for the passphrase before showing anything", async () => {
    loadVault.mockResolvedValue({ label: "My Knowledge Vault", createdAt: "2026-01-01" });
    render(<VaultScreen userId="user-1" onClose={vi.fn()} />);

    expect(await screen.findByRole("heading", { name: "Unlock your Vault" })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Vault items" })).not.toBeInTheDocument();
  });

  it("shows an error on a wrong passphrase without unlocking", async () => {
    loadVault.mockResolvedValue({ label: "My Knowledge Vault", createdAt: "2026-01-01" });
    unlockVault.mockResolvedValue(false);
    render(<VaultScreen userId="user-1" onClose={vi.fn()} />);

    fireEvent.change(await screen.findByLabelText("Vault passphrase"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/does not match/i);
  });

  it("unlocks and shows items on the right passphrase", async () => {
    loadVault.mockResolvedValue({ label: "My Knowledge Vault", createdAt: "2026-01-01" });
    unlockVault.mockResolvedValue(true);
    listVaultItems.mockResolvedValue([item()]);
    render(<VaultScreen userId="user-1" onClose={vi.fn()} />);

    fireEvent.change(await screen.findByLabelText("Vault passphrase"), { target: { value: "correct horse" } });
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));

    expect(await screen.findByText("Longitudinal effects of microplastics")).toBeInTheDocument();
    expect(unlockVault).toHaveBeenCalledWith("correct horse");
  });

  it("honestly states the recovery code cannot substitute for the passphrase in this version (P0-2 fix)", async () => {
    loadVault.mockResolvedValue({ label: "My Knowledge Vault", createdAt: "2026-01-01" });
    render(<VaultScreen userId="user-1" onClose={vi.fn()} />);

    // The lock screen must NOT claim the recovery code can open the Vault (it can't, in this version).
    expect(await screen.findByText(/no automated way to open the Vault without it/i)).toBeInTheDocument();
    // Must still say we cannot recover the contents if the passphrase is lost.
    expect(screen.getByText(/cannot be recovered by anyone, including us/i)).toBeInTheDocument();
    // §6.3: No reset button — there is genuinely no automated recovery path.
    expect(screen.queryByRole("button", { name: /reset/i })).not.toBeInTheDocument();
  });
});

describe("unlocked", () => {
  beforeEach(() => {
    loadVault.mockResolvedValue({ label: "My Knowledge Vault", createdAt: "2026-01-01" });
    isVaultUnlocked.mockReturnValue(true);
  });

  it("shows an empty state with nothing saved yet", async () => {
    listVaultItems.mockResolvedValue([]);
    render(<VaultScreen userId="user-1" onClose={vi.fn()} />);

    expect(await screen.findByText("Nothing in your Vault yet.")).toBeInTheDocument();
  });

  it("adds material and shows it immediately without a re-fetch", async () => {
    listVaultItems.mockResolvedValue([]);
    const saved = item({ id: "new-item" });
    addVaultItem.mockResolvedValue(saved);
    render(<VaultScreen userId="user-1" onClose={vi.fn()} />);

    await screen.findByText("Nothing in your Vault yet.");
    fireEvent.click(screen.getByRole("button", { name: "Add material" }));

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: saved.title } });
    fireEvent.change(screen.getByLabelText("Notes or material"), { target: { value: saved.content } });
    fireEvent.change(screen.getByLabelText(/Source citation/), { target: { value: saved.citation! } });
    fireEvent.click(screen.getByRole("button", { name: "Save to Vault" }));

    await waitFor(() =>
      expect(addVaultItem).toHaveBeenCalledWith("user-1", {
        title: saved.title,
        content: saved.content,
        citation: saved.citation,
        citationStatus: "needs_user_review",
      })
    );
    expect(await screen.findByText(saved.title)).toBeInTheDocument();
  });

  it("cannot save without a title or content", async () => {
    listVaultItems.mockResolvedValue([]);
    render(<VaultScreen userId="user-1" onClose={vi.fn()} />);

    await screen.findByText("Nothing in your Vault yet.");
    fireEvent.click(screen.getByRole("button", { name: "Add material" }));
    expect(screen.getByRole("button", { name: "Save to Vault" })).toBeDisabled();
  });

  it("filters the list as you search", async () => {
    listVaultItems.mockResolvedValue([item(), item({ id: "item-2", title: "Remote work and tacit knowledge" })]);
    render(<VaultScreen userId="user-1" onClose={vi.fn()} />);

    await screen.findByText("Remote work and tacit knowledge");
    fireEvent.change(screen.getByLabelText("Search your Vault"), { target: { value: "microplastics" } });

    expect(screen.getByText("Longitudinal effects of microplastics")).toBeInTheDocument();
    expect(screen.queryByText("Remote work and tacit knowledge")).not.toBeInTheDocument();
  });

  it("deletes only after a second, explicit confirmation", async () => {
    listVaultItems.mockResolvedValue([item()]);
    render(<VaultScreen userId="user-1" onClose={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    expect(deleteVaultItem).not.toHaveBeenCalled();

    expect(screen.getByText(/no undo/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(deleteVaultItem).toHaveBeenCalledWith("user-1", "item-1"));
  });

  it("can abandon a delete without deleting anything", async () => {
    listVaultItems.mockResolvedValue([item()]);
    render(<VaultScreen userId="user-1" onClose={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(deleteVaultItem).not.toHaveBeenCalled();
    expect(screen.getByText("Longitudinal effects of microplastics")).toBeInTheDocument();
  });

  it("locks and returns to the passphrase gate", async () => {
    listVaultItems.mockResolvedValue([]);
    render(<VaultScreen userId="user-1" onClose={vi.fn()} />);

    await screen.findByText("Nothing in your Vault yet.");
    fireEvent.click(screen.getByRole("button", { name: "Lock" }));

    expect(lockVault).toHaveBeenCalled();
    expect(await screen.findByRole("heading", { name: "Unlock your Vault" })).toBeInTheDocument();
  });
});
