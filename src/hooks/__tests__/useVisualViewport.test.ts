import { describe, it, expect } from "vitest";
import { isKeyboardOpen, KEYBOARD_MIN_DELTA_PX } from "../useVisualViewport";

describe("isKeyboardOpen", () => {
  it("ignores small differences caused by browser chrome", () => {
    expect(isKeyboardOpen(844, 844)).toBe(false);
    expect(isKeyboardOpen(844, 844 - KEYBOARD_MIN_DELTA_PX)).toBe(false);
  });
  it("detects a keyboard-sized loss of height", () => {
    expect(isKeyboardOpen(844, 844 - KEYBOARD_MIN_DELTA_PX - 1)).toBe(true);
    expect(isKeyboardOpen(844, 500)).toBe(true);
  });
});
