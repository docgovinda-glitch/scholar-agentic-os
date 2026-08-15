// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import EvidenceLedgerPanel from "../evidence/EvidenceLedgerPanel";
import * as vaultContents from "../../services/vaultContents";

vi.mock("../../services/vaultContents", () => ({
  isVaultUnlocked: vi.fn(() => true),
  listVaultItems: vi.fn(),
  searchVaultItems: (items: Array<{ title: string }>, q: string) =>
    q.trim() ? items.filter((i) => i.title.toLowerCase().includes(q.toLowerCase())) : items,
}));

const originalFetch = global.fetch;

function mockFetch(handler: (url: string, method: string, body: unknown) => { status: number; body: unknown }) {
  global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = (init?.method ?? "GET").toUpperCase();
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    const { status, body: respBody } = handler(url, method, body);
    return Promise.resolve({ ok: status < 400, status, json: async () => respBody } as Response);
  }) as unknown as typeof fetch;
}

afterEach(() => {
  global.fetch = originalFetch;
  cleanup();
});

const PROJECT_ID = "proj-ev-1";

describe("Desk — EvidenceLedgerPanel", () => {
  it("loads an empty ledger with no sources or evidence", async () => {
    mockFetch((url) => {
      if (url.includes("/evidence-ledger") && !url.includes("claims")) return { status: 200, body: { sources: [], items: [] } };
      if (url.includes("/claims")) return { status: 200, body: { claims: [], bindings: [] } };
      return { status: 500, body: {} };
    });
    render(<EvidenceLedgerPanel projectId={PROJECT_ID} actor="u1" />);

    await screen.findByText("Sources (0)");
    expect(screen.getByText("No sources discovered yet.")).toBeInTheDocument();
    expect(screen.getByText("No evidence extracted yet.")).toBeInTheDocument();
  });

  it("discovers sources via arXiv and adds them to the list without creating any evidence item", async () => {
    mockFetch((url, method) => {
      if (url.endsWith("/claims") && method === "GET") return { status: 200, body: { claims: [], bindings: [] } };
      if (url.includes("/evidence-ledger/discover")) {
        return {
          status: 200,
          body: {
            added: [{ id: "src-1", title: "A Discovered Paper", authors: ["X"], sourceType: "scholarly", authorityTier: "B", discoveredVia: "arxiv", discoveredAt: "now" }],
            evidenceLedger: {
              sources: [{ id: "src-1", title: "A Discovered Paper", authors: ["X"], sourceType: "scholarly", authorityTier: "B", discoveredVia: "arxiv", discoveredAt: "now" }],
              items: [],
            },
          },
        };
      }
      if (url.includes("/evidence-ledger")) return { status: 200, body: { sources: [], items: [] } };
      return { status: 500, body: {} };
    });
    render(<EvidenceLedgerPanel projectId={PROJECT_ID} actor="u1" />);

    await screen.findByText("Sources (0)");
    fireEvent.change(screen.getByLabelText("Search query"), { target: { value: "test topic" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    await screen.findByText("A Discovered Paper");
    expect(screen.getByText("Sources (1)")).toBeInTheDocument();
    expect(screen.getByText("No evidence extracted yet.")).toBeInTheDocument();
  });

  it("extracts a quote from a source, creating an evidence item shown as 'Extracted'", async () => {
    const source = { id: "src-1", title: "A Source", authors: [], sourceType: "user_provided", authorityTier: "C", discoveredVia: "manual", discoveredAt: "now" };
    mockFetch((url, method) => {
      if (url.endsWith("/claims") && method === "GET") return { status: 200, body: { claims: [], bindings: [] } };
      if (url.includes("/extract")) {
        return {
          status: 201,
          body: {
            sources: [source],
            items: [{ id: "ev-1", sourceId: "src-1", state: "extracted", quote: "A verbatim quote.", history: [] }],
          },
        };
      }
      if (url.includes("/evidence-ledger")) return { status: 200, body: { sources: [source], items: [] } };
      return { status: 500, body: {} };
    });
    render(<EvidenceLedgerPanel projectId={PROJECT_ID} actor="u1" />);

    await screen.findByText("A Source");
    fireEvent.click(screen.getByRole("button", { name: "Extract a quote" }));
    fireEvent.change(screen.getByLabelText("Quote from A Source"), { target: { value: "A verbatim quote." } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await screen.findByText('"A verbatim quote."');
    expect(screen.getByText("Extracted")).toBeInTheDocument();
  });

  it("approving a proposed item calls onApproved and shows the item as Citable", async () => {
    const onApproved = vi.fn();
    const source = { id: "src-1", title: "A Source", authors: [], sourceType: "user_provided", authorityTier: "C", discoveredVia: "manual", discoveredAt: "now" };
    const proposedItem = { id: "ev-1", sourceId: "src-1", state: "proposed", quote: "A quote.", proposedClaimId: "claim-1", history: [] };
    mockFetch((url, method) => {
      if (url.endsWith("/claims") && method === "GET") return { status: 200, body: { claims: [{ id: "claim-1", text: "Something is true." }], bindings: [] } };
      if (url.includes("/approve")) {
        return {
          status: 200,
          body: {
            evidenceLedger: { sources: [source], items: [{ ...proposedItem, state: "citable" }] },
            claimGraph: { claims: [{ id: "claim-1", text: "Something is true." }], bindings: [{ id: "b1", claimId: "claim-1", evidence: [], strength: "strong", rationale: "x" }] },
          },
        };
      }
      if (url.includes("/evidence-ledger")) return { status: 200, body: { sources: [source], items: [proposedItem] } };
      return { status: 500, body: {} };
    });
    render(<EvidenceLedgerPanel projectId={PROJECT_ID} actor="u1" onApproved={onApproved} />);

    await screen.findByText('"A quote."');
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    fireEvent.change(screen.getByLabelText("Approval rationale"), { target: { value: "Directly supports the claim." } });
    fireEvent.click(screen.getByRole("button", { name: /Confirm approval/ }));

    await waitFor(() => expect(onApproved).toHaveBeenCalled());
    expect(await screen.findByText("Citable")).toBeInTheDocument();
  });

  describe("Add from my Vault", () => {
    afterEach(() => vi.mocked(vaultContents.listVaultItems).mockReset());

    it("does not offer the Vault picker without a userId (no session yet)", async () => {
      mockFetch((url) => {
        if (url.includes("/evidence-ledger") && !url.includes("claims")) return { status: 200, body: { sources: [], items: [] } };
        if (url.includes("/claims")) return { status: 200, body: { claims: [], bindings: [] } };
        return { status: 500, body: {} };
      });
      render(<EvidenceLedgerPanel projectId={PROJECT_ID} actor="u1" />);
      await screen.findByText("Sources (0)");
      expect(screen.queryByRole("button", { name: "Add from my Vault" })).not.toBeInTheDocument();
    });

    it("shows a locked message with an Open Vault action when the Vault hasn't been unlocked", async () => {
      vi.mocked(vaultContents.isVaultUnlocked).mockReturnValue(false);
      const onOpenVault = vi.fn();
      mockFetch((url) => {
        if (url.includes("/evidence-ledger") && !url.includes("claims")) return { status: 200, body: { sources: [], items: [] } };
        if (url.includes("/claims")) return { status: 200, body: { claims: [], bindings: [] } };
        return { status: 500, body: {} };
      });
      render(<EvidenceLedgerPanel projectId={PROJECT_ID} actor="u1" userId="user-1" onOpenVault={onOpenVault} />);
      await screen.findByText("Sources (0)");

      fireEvent.click(screen.getByRole("button", { name: "Add from my Vault" }));
      expect(await screen.findByText(/Your Vault is locked/)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Open Vault" }));
      expect(onOpenVault).toHaveBeenCalled();
      vi.mocked(vaultContents.isVaultUnlocked).mockReturnValue(true);
    });

    it("lists unlocked Vault items, searches them, and adds one as a source tagged discoveredVia: vault", async () => {
      vi.mocked(vaultContents.isVaultUnlocked).mockReturnValue(true);
      vi.mocked(vaultContents.listVaultItems).mockResolvedValue([
        { id: "vault-1", title: "My Saved Note", content: "Some saved content.", citation: "Author (2024)", createdAt: "now" },
        { id: "vault-2", title: "Another Item", content: "Other content.", createdAt: "now" },
      ]);
      let capturedBody: Record<string, unknown> | null = null;
      mockFetch((url, method, body) => {
        if (url.endsWith("/claims") && method === "GET") return { status: 200, body: { claims: [], bindings: [] } };
        if (url.includes("/evidence-ledger/sources") && method === "POST") {
          capturedBody = body as Record<string, unknown>;
          return {
            status: 201,
            body: {
              sources: [{ id: "src-vault-1", title: "My Saved Note", authors: [], sourceType: "vault", authorityTier: "D", discoveredVia: "vault", vaultItemId: "vault-1", discoveredAt: "now" }],
              items: [],
            },
          };
        }
        if (url.includes("/evidence-ledger")) return { status: 200, body: { sources: [], items: [] } };
        return { status: 500, body: {} };
      });
      render(<EvidenceLedgerPanel projectId={PROJECT_ID} actor="u1" userId="user-1" />);
      await screen.findByText("Sources (0)");

      fireEvent.click(screen.getByRole("button", { name: "Add from my Vault" }));
      await screen.findByText("My Saved Note");
      expect(screen.getByText("Another Item")).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText("Search your Vault"), { target: { value: "Saved" } });
      expect(screen.queryByText("Another Item")).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Add" }));

      await waitFor(() => expect(capturedBody).not.toBeNull());
      expect(capturedBody).toMatchObject({ title: "My Saved Note", sourceType: "vault", discoveredVia: "vault", vaultItemId: "vault-1" });
      expect(await screen.findByText("Added")).toBeInTheDocument();
      expect(screen.getByText("Sources (1)")).toBeInTheDocument();
    });
  });
});
