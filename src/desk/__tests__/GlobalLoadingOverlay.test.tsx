// @vitest-environment jsdom

import { describe, it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { LoadingProvider, useLoading, globalLoading } from "../context/LoadingContext";
import GlobalLoadingOverlay from "../components/GlobalLoadingOverlay";

function TestTrigger() {
  const { isLoading, startLoading, stopLoading } = useLoading();
  return (
    <div>
      <span data-testid="status">{isLoading ? "loading" : "idle"}</span>
      <button onClick={() => startLoading("manual")}>Start</button>
      <button onClick={() => stopLoading("manual")}>Stop</button>
    </div>
  );
}

describe("GlobalLoadingOverlay & LoadingContext", () => {
  it("renders with dark overlay and active AI breathing logo when active", () => {
    render(
      <LoadingProvider>
        <GlobalLoadingOverlay active={true} message="Authenticating..." />
      </LoadingProvider>
    );

    const overlay = screen.getByTestId("global-loading-overlay");
    expect(overlay).toBeInTheDocument();
    expect(overlay).toHaveClass("ai-loading-overlay", "is-visible");

    // Exact filename check
    const img = screen.getByAltText("Active AI Core Processing") as HTMLImageElement;
    expect(img).toBeInTheDocument();
    expect(img.src).toContain("cognitive_authority_veena_logo_v7b_colored_details.png");
    expect(img).toHaveClass("ai-loader-spin");

    // Label check
    expect(screen.getByText("Authenticating...")).toBeInTheDocument();
  });

  it("dynamically mounts and transitions based on globalLoading state", () => {
    render(
      <LoadingProvider>
        <TestTrigger />
        <GlobalLoadingOverlay />
      </LoadingProvider>
    );

    expect(screen.getByTestId("status").textContent).toBe("idle");
    expect(screen.queryByTestId("global-loading-overlay")).not.toBeInTheDocument();

    // Trigger loading
    act(() => {
      globalLoading.startLoading("test-op");
    });

    expect(screen.getByTestId("status").textContent).toBe("loading");
    const overlay = screen.getByTestId("global-loading-overlay");
    expect(overlay).toBeInTheDocument();
    expect(overlay).toHaveClass("is-visible");

    // Stop loading
    act(() => {
      globalLoading.stopLoading("test-op");
    });

    expect(screen.getByTestId("status").textContent).toBe("idle");
    expect(overlay).toHaveClass("is-hidden");
  });
});
