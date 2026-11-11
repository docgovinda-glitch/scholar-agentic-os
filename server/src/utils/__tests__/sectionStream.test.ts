import { describe, it, expect, vi } from "vitest";
import { chunkPreservingWhitespace, openSseStream, paragraphRange, SSE_HEADERS, SSE_HEARTBEAT_MS } from "../sectionStream";
import { trimToSentenceWithinWords } from "../sectionBudget";

describe("chunkPreservingWhitespace", () => {
  it("joins back to the exact text, blank lines included", () => {
    const text = "One two three four five six.\n\nSeven eight nine ten.\n\nEleven.";
    const chunks = chunkPreservingWhitespace(text, 5);
    expect(chunks.join("")).toBe(text);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.some((c) => c.includes("\n\n"))).toBe(true);
  });
});

describe("openSseStream", () => {
  it("sets the SSE headers and flushes before any model output", () => {
    const calls: string[] = [];
    const headers: Record<string, string> = {};
    const res = {
      status: vi.fn(() => res),
      setHeader: (k: string, v: string) => { headers[k] = v; calls.push(`header:${k}`); },
      flushHeaders: () => calls.push("flush"),
      write: (s: string) => calls.push(`write:${s}`),
    };
    openSseStream(res as never);
    expect(headers).toEqual(SSE_HEADERS);
    expect(headers["Cache-Control"]).toBe("no-cache, no-transform");
    expect(headers["X-Accel-Buffering"]).toBe("no");
    expect(calls.indexOf("flush")).toBeGreaterThan(calls.lastIndexOf("header:X-Accel-Buffering"));
    expect(calls.at(-1)).toBe("write:: connected\n\n");
    expect(SSE_HEARTBEAT_MS).toBe(5000);
  });
});

describe("paragraphRange", () => {
  it("asks for 2-4 paragraphs by length", () => {
    expect(paragraphRange(150)).toBe("2");
    expect(paragraphRange(250)).toBe("2-3");
    expect(paragraphRange(400)).toBe("3-4");
  });
});

describe("trimToSentenceWithinWords", () => {
  it("cuts at the end of a complete sentence, never mid-word, keeping paragraphs", () => {
    const text = "Physical channels leak information. Quantum keys detect eavesdroppers!\n\nPhysical channels still need authentication because an attacker can impersonate either party during setup.";
    const out = trimToSentenceWithinWords(text, 14);
    expect(out).toBe("Physical channels leak information. Quantum keys detect eavesdroppers!");
    expect(out).toMatch(/[.!?]["')\]]?\s*$/);
  });

  it("does not treat et al. as a sentence end", () => {
    const text = "Arute et al. (2019) demonstrated sampling. Their processor used fifty-three qubits on a two dimensional grid of couplers.";
    expect(trimToSentenceWithinWords(text, 10)).toBe("Arute et al. (2019) demonstrated sampling.");
  });

  it("leaves text within budget unchanged", () => {
    expect(trimToSentenceWithinWords("Short text.\n\nTwo.", 50)).toBe("Short text.\n\nTwo.");
  });
});
