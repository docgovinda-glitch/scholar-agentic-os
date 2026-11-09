// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import CitationStylePicker from "../CitationStylePicker";

function mockViewport(phone: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: phone && query === "(max-width: 639px)",
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Ask Scholar popovers on phones", () => {
  it("opens the citation list as a sheet on the page, not clipped inside the header", () => {
    mockViewport(true);
    render(<CitationStylePicker value="apa7" onChange={() => {}} direction="down" />);
    fireEvent.click(screen.getByTestId("citation-style-trigger"));
    const list = screen.getByRole("listbox", { name: "Referencing style" });
    // Portalled straight under body, so no header or composer can clip it.
    expect(list.parentElement).toBe(document.body);
    expect(list.className).toContain("fixed");
    expect(list.className).toContain("inset-x-3");
  });

  it("keeps the anchored popover on wider screens", () => {
    mockViewport(false);
    const { container } = render(<CitationStylePicker value="apa7" onChange={() => {}} direction="down" />);
    fireEvent.click(screen.getByTestId("citation-style-trigger"));
    const list = screen.getByRole("listbox", { name: "Referencing style" });
    expect(container.contains(list)).toBe(true);
    expect(list.className).toContain("absolute");
  });

  it("closes when the student taps outside the sheet", () => {
    mockViewport(true);
    render(
      <div>
        <p>outside</p>
        <CitationStylePicker value="apa7" onChange={() => {}} direction="down" />
      </div>
    );
    fireEvent.click(screen.getByTestId("citation-style-trigger"));
    expect(screen.getByRole("listbox", { name: "Referencing style" })).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByText("outside"));
    expect(screen.queryByRole("listbox", { name: "Referencing style" })).not.toBeInTheDocument();
  });
});
