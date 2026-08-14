// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import EvidenceLedgerPanel from "../evidence/EvidenceLedgerPanel";

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
});
