// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const listVaultItems = vi.fn();
const linkVaultItemToProject = vi.fn();
let unlocked = true;
vi.mock("../../../services/userVault", () => ({ currentUserId: vi.fn(async () => "user-1") }));
vi.mock("../../../services/vaultContents", () => ({
  isVaultUnlocked: () => unlocked,
  listVaultItems: (...a: unknown[]) => listVaultItems(...a),
  linkVaultItemToProject: (...a: unknown[]) => linkVaultItemToProject(...a),
  searchVaultItems: (items: Array<{ title: string }>, q: string) => items.filter((i) => i.title.toLowerCase().includes(q.toLowerCase())),
}));

import { VaultSourcePicker } from "../components/VaultSourcePicker";
import { vaultItemToDiscoveredSource } from "../services/vaultSources";

const ITEMS = [
  { id: "v1", title: "Central banking and inflation", content: "Notes on rates", authors: ["Smith, J."], year: "2021", journal: "J Money", createdAt: "2026-01-01" },
  { id: "v2", title: "Trade unions", content: "", createdAt: "2026-01-02" },
];

describe("VaultSourcePicker (Stage 3 vault channel)", () => {
  beforeEach(() => {
    unlocked = true;
    listVaultItems.mockResolvedValue(ITEMS);
    linkVaultItemToProject.mockResolvedValue(null);
  });
  afterEach(() => cleanup());

  it("lists, searches and adds vault items as approved sources and links them to the project", async () => {
    const onAdd = vi.fn();
    render(<VaultSourcePicker projectId="p1" existingSourceIds={["vault-v2"]} onAdd={onAdd} />);
    fireEvent.click(screen.getByTestId("open-vault-picker"));
    expect(await screen.findByText("Central banking and inflation")).toBeInTheDocument();
    expect(screen.getByText(/already added/)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Search titles/), { target: { value: "central" } });
    expect(screen.queryByText("Trade unions")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByTestId("vault-add-selected"));
    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    const added = onAdd.mock.calls[0][0];
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ id: "vault-v1", vaultItemId: "v1", retrievalSource: "vault", authors: ["Smith, J."], year: "2021" });
    await waitFor(() => expect(linkVaultItemToProject).toHaveBeenCalledWith("user-1", "v1", "p1"));
  });

  it("explains a locked vault instead of failing", async () => {
    unlocked = false;
    listVaultItems.mockRejectedValue(new Error("The Vault is locked."));
    render(<VaultSourcePicker projectId="p1" existingSourceIds={[]} onAdd={vi.fn()} />);
    fireEvent.click(screen.getByTestId("open-vault-picker"));
    expect(await screen.findByText(/vault is locked/i)).toBeInTheDocument();
  });

  it("never invents metadata for a bare vault item", () => {
    const s = vaultItemToDiscoveredSource({ id: "x", title: "", content: "", createdAt: "" });
    expect(s.authors).toEqual([]);
    expect(s.year).toBe("n.d.");
    expect(s.citation).toBe("");
    expect(s.mainFinding).toBe("");
  });
});
