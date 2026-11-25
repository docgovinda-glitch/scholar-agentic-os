// @vitest-environment jsdom
// The Vault must never spin forever: a stalled load becomes an error with Retry,
// an empty vault becomes the empty state, and the screen renders in the pane
// (not as a fixed full-screen overlay over the sidebar).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const listVaultItems = vi.fn();
vi.mock("../../../services/vaultContents", () => ({
  listVaultItems: (...a: unknown[]) => listVaultItems(...a),
  addVaultItem: vi.fn(),
  deleteVaultItem: vi.fn(),
  lockVault: vi.fn(),
  linkVaultItemToProject: vi.fn(),
  unlinkVaultItemFromProject: vi.fn(),
}));
vi.mock("../../../services/vault/cloudDriveService", () => ({ getConnectedCloudDrives: vi.fn().mockResolvedValue([]) }));
vi.mock("../../../services/vault/semanticSearchService", () => ({ searchVaultSemantically: vi.fn() }));
vi.mock("../../../services/vault/retractionService", () => ({ scanVaultRetractions: vi.fn() }));
vi.mock("../../api", () => ({ listProjects: vi.fn().mockResolvedValue({ items: [] }) }));
vi.mock("../AddSourceModal", () => ({ default: () => null }));
vi.mock("../SourceDetailModal", () => ({ default: () => null }));
vi.mock("../LiteratureMatrixModal", () => ({ default: () => null }));
vi.mock("../SettingsView", () => ({ default: () => null }));
vi.mock("../../../services/vault/batchExportHelper", () => ({ generateBatchBibTeX: vi.fn(), downloadTextFile: vi.fn() }));

import SourceLibraryScreen from "../SourceLibraryScreen";

const props = { userId: "u1", onClose: vi.fn(), onLock: vi.fn(), onResetVault: vi.fn(), onOpenProject: vi.fn() };

beforeEach(() => {
  vi.useFakeTimers();
  listVaultItems.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Source Library loading", () => {
  it("turns a stalled load into an error with Retry, then recovers", async () => {
    listVaultItems.mockReturnValueOnce(new Promise(() => {}));
    render(<SourceLibraryScreen {...props} />);
    expect(screen.getByText(/Loading your sources/)).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_100);
    });
    expect(screen.queryByText(/Loading your sources/)).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent(/took too long/i);

    listVaultItems.mockResolvedValueOnce([]);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(screen.getByText("Your Source Library is empty")).toBeInTheDocument();
  });

  it("shows the empty state when the vault resolves empty", async () => {
    listVaultItems.mockResolvedValue([]);
    render(<SourceLibraryScreen {...props} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(screen.getByText("Your Source Library is empty")).toBeInTheDocument();
  });

  it("is not a fixed full-screen overlay", async () => {
    listVaultItems.mockResolvedValue([]);
    const { container } = render(<SourceLibraryScreen {...props} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect((container.firstElementChild as HTMLElement).className).not.toMatch(/\bfixed\b/);
  });
});
