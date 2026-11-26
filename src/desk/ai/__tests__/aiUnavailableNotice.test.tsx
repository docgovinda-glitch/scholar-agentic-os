// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import {
  AI_UNAVAILABLE_QUIET_MS,
  announceAiUnavailable,
  inspectAiFailure,
  resetAiUnavailableNotice,
  subscribeAiUnavailable,
} from "../aiUnavailableNotice";
import { AiUnavailableHost } from "../AiUnavailableHost";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => resetAiUnavailableNotice());
afterEach(() => cleanup());

describe("aiUnavailableNotice", () => {
  it("announces the three no-AI codes from a failed AI response, and nothing else", async () => {
    const seen: string[] = [];
    const off = subscribeAiUnavailable((n) => seen.push(n.code));
    inspectAiFailure(json(503, { code: "ai_unavailable", error: "out of credit" }));
    inspectAiFailure(json(400, { code: "ai_context_overflow", error: "too long" }));
    inspectAiFailure(json(200, { code: "ai_unavailable" }));
    await waitFor(() => expect(seen).toEqual(["ai_unavailable"]));
    off();
  });

  it("does not repeat the same failure inside the quiet window", () => {
    const fn = vi.fn();
    const off = subscribeAiUnavailable(fn);
    expect(announceAiUnavailable({ code: "ai_unavailable", message: "" }, 1000)).toBe(true);
    expect(announceAiUnavailable({ code: "ai_unavailable", message: "" }, 2000)).toBe(false);
    expect(announceAiUnavailable({ code: "ai_provider_required", message: "" }, 2500)).toBe(true);
    expect(announceAiUnavailable({ code: "ai_provider_required", message: "" }, 2500 + AI_UNAVAILABLE_QUIET_MS)).toBe(true);
    expect(fn).toHaveBeenCalledTimes(3);
    off();
  });
});

describe("AiUnavailableHost", () => {
  it("offers AI Access as the way out and can be dismissed", async () => {
    render(
      <MemoryRouter initialEntries={["/projects/p1"]}>
        <Routes>
          <Route path="/ai-access" element={<p>AI Access page</p>} />
          <Route path="*" element={<AiUnavailableHost />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.queryByTestId("ai-unavailable-dialog")).toBeNull();
    act(() => {
      announceAiUnavailable({ code: "ai_provider_required", message: "No AI connected" });
    });
    expect(screen.getByRole("dialog")).toHaveTextContent("Connect an AI to continue");
    fireEvent.click(screen.getByRole("button", { name: /Open AI Access/i }));
    expect(await screen.findByText("AI Access page")).toBeInTheDocument();
  });
});
