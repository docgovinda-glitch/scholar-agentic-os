import { describe, it, expect } from "vitest";
import { classifyViewport } from "../useDeviceClass";

describe("classifyViewport", () => {
  it("treats narrow windows as mobile", () => {
    expect(classifyViewport(390, 844, true)).toBe("mobile");
    expect(classifyViewport(600, 800, false)).toBe("mobile");
  });
  it("treats a phone in landscape as mobile, not a tablet", () => {
    expect(classifyViewport(844, 390, true)).toBe("mobile");
    expect(classifyViewport(932, 430, true)).toBe("mobile");
    expect(classifyViewport(667, 375, true)).toBe("mobile");
  });
  it("keeps tablets and desktops as before", () => {
    expect(classifyViewport(820, 1180, true)).toBe("tablet");
    expect(classifyViewport(1024, 768, true)).toBe("tablet");
    expect(classifyViewport(900, 700, false)).toBe("tablet");
    expect(classifyViewport(1440, 900, false)).toBe("desktop");
  });
  it("does not shrink a mouse-driven desktop window into the phone layout by height alone", () => {
    expect(classifyViewport(1280, 400, false)).toBe("desktop");
  });
});
