import { describe, it, expect } from "vitest";
import {
  MAX_TURNS,
  buildConversationContext,
  normalizeAskHistory,
  stripReferenceList,
  withConversation,
} from "../askConversation";

describe("askConversation", () => {
  it("strips the reference list from an earlier answer", () => {
    const answer = "Effects are mixed (Kubin, 2021).\n\n## References\nKubin, E. (2021). Social media and polarization.";
    expect(stripReferenceList(answer)).toBe("Effects are mixed (Kubin, 2021).");
  });

  it("keeps only well-formed turns, newest last, at most MAX_TURNS", () => {
    const raw = [
      { role: "system", content: "ignored" },
      { role: "user", content: "  " },
      ...Array.from({ length: MAX_TURNS + 3 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `turn ${i}` })),
    ];
    const turns = normalizeAskHistory(raw);
    expect(turns).toHaveLength(MAX_TURNS);
    expect(turns.at(-1)?.content).toBe(`turn ${MAX_TURNS + 2}`);
    expect(normalizeAskHistory("not a list")).toEqual([]);
  });

  it("sends recent turns nearly whole and older turns shortened, without reference lists", () => {
    const long = "A long earlier point. ".repeat(60);
    const history = [
      { role: "user" as const, content: long },
      { role: "assistant" as const, content: `${long}\n\n## References\nSomeone (2020).` },
      { role: "user" as const, content: "Second question" },
      { role: "assistant" as const, content: "Second answer.\n\n## References\nOther (2021)." },
      { role: "user" as const, content: "Third question" },
      { role: "assistant" as const, content: "Third answer." },
    ];
    const ctx = buildConversationContext(history);
    expect(ctx).toContain("User: Second question");
    expect(ctx).toContain("Scholar Core: Second answer.");
    expect(ctx).not.toMatch(/## References|Someone \(2020\)|Other \(2021\)/);
    // The two oldest turns are cut to a short line.
    expect(ctx.length).toBeLessThan(long.length);
  });

  it("puts the conversation before the question for single-prompt paths", () => {
    expect(withConversation("And in Nepal?", [])).toBe("And in Nepal?");
    const p = withConversation("And in Nepal?", [
      { role: "user", content: "How did remittances change GDP in South Asia?" },
      { role: "assistant", content: "They rose sharply." },
    ]);
    expect(p).toMatch(/User: How did remittances change GDP in South Asia\?[\s\S]*User Inquiry: And in Nepal\?$/);
  });
});
