// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { AiRunStatus } from "../AiRunStatus";
import { initialAiRunState, reduceAiRun, type AiRunState } from "../aiRunState";
import type { RouterEvent } from "../../../platform/router/types";

afterEach(cleanup);
const play = (evs: RouterEvent[], now = 1_000) => evs.reduce<AiRunState>((s, e) => reduceAiRun(s, e, now), initialAiRunState);
const start: RouterEvent = { type: "route_start", requestId: "r", chain: [] };
const attempt = (id: string, label: string): RouterEvent => ({ type: "attempt_start", candidateId: id, label, lane: "byok", attempt: 1, maxOutputTokens: 1000 });

describe("AI run state and status", () => {
  it("a fallback is shown with both models and the reason, and drops a discarded partial answer", () => {
    const s = play([start, attempt("a", "Model A · your key"), { type: "token", text: "half" },
      { type: "fallback", from: "a", fromLabel: "Model A · your key", to: "b", toLabel: "Model B · your key", reason: "server", httpStatus: 503, message: "x", partialOutputDiscarded: true },
      attempt("b", "Model B · your key")]);
    expect(s.text).toBe("");
    render(<AiRunStatus state={s} />);
    expect(screen.getByText(/Switched from Model A · your key to Model B · your key: provider error \(HTTP 503\)/)).toBeInTheDocument();
    expect(screen.getByText(/partial answer was discarded/)).toBeInTheDocument();
    expect(screen.getByText("Your key")).toBeInTheDocument();
  });

  it("a retry shows a live countdown; Stop calls cancel", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const s = play([start, attempt("a", "A"), { type: "retry", candidateId: "a", attempt: 2, maxAttempts: 2, waitMs: 5_000, reason: "rate_limit", message: "slow" }]);
    const onCancel = vi.fn();
    render(<AiRunStatus state={s} onCancel={onCancel} />);
    expect(screen.getByText("Waiting 5s before retrying")).toBeInTheDocument();
    expect(screen.getByText(/rate limit reached\. Retrying \(attempt 2 of 2\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Stop/ }));
    expect(onCancel).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("an error is an alert with the plain message; done shows who answered and speed", () => {
    const failed = play([start, { type: "error", code: "exhausted", message: "All models failed. Last error: quota.", trace: [] }]);
    render(<AiRunStatus state={failed} />);
    expect(screen.getByRole("alert")).toHaveTextContent("All models failed");
    cleanup();
    const done = play([start, attempt("a", "A"), { type: "metrics", candidateId: "a", ttftMs: 820, tokensPerSecond: 61.4, outputTokens: 100 },
      { type: "done", candidateId: "a", label: "Model A · your key", lane: "byok", finishReason: "stop", usage: { inputTokens: 1, outputTokens: 1, source: "provider" }, trace: [] }]);
    render(<AiRunStatus state={done} />);
    expect(screen.getByText("Answered by Model A · your key")).toBeInTheDocument();
    expect(screen.getByText(/0\.8s · 61 tok\/s/)).toBeInTheDocument();
  });
});
