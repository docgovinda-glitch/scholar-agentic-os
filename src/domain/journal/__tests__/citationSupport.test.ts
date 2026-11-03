import { describe, it, expect } from "vitest";
import { buildPairs, citingSentences, groundSupport, parseSupport, supportUserPrompt, textFingerprint, MAX_PAIRS } from "../citationSupport";

const sources = [
  { id: "a", title: "Sleep study", text: "Participants who slept recalled 20% more word pairs than those who stayed awake." },
  { id: "b", title: "Caffeine trial", text: "Caffeine had no effect on recall." },
  { id: "c", title: "Untouched source", text: "" },
];
const md = [
  "### § Introduction",
  "",
  "Sleep improves recall of word pairs [CITE:a]. Caffeine also improves recall [CITE:b]; see [FIG:f1].",
  "",
  "Both factors matter [CITE:a] [CITE:c]. A sentence with no citation.",
  "",
  "| a | b |",
  "| - | - |",
  "| [CITE:a] | x |",
].join("\n");

describe("citingSentences and buildPairs", () => {
  it("pairs each citing sentence with each source it cites, skipping headings and tables", () => {
    expect(citingSentences(md)).toEqual([
      { sentence: "Sleep improves recall of word pairs.", citeId: "a" },
      { sentence: "Caffeine also improves recall; see the figure.", citeId: "b" },
      { sentence: "Both factors matter.", citeId: "a" },
      { sentence: "Both factors matter.", citeId: "c" },
    ]);
    const { pairs, truncated } = buildPairs(md, sources);
    expect(pairs.map((p) => [p.key, p.citeId, p.sourceTitle])).toEqual([
      ["p1", "a", "Sleep study"],
      ["p2", "b", "Caffeine trial"],
      ["p3", "a", "Sleep study"],
      ["p4", "c", "Untouched source"],
    ]);
    expect(truncated).toBe(0);
    // A source with nothing recorded is never sent to the AI.
    expect(supportUserPrompt(pairs)).not.toContain("Untouched source");
  });

  it("checks at most 40 pairs and says how many were left", () => {
    const many = Array.from({ length: 45 }, (_, i) => `Claim ${i} [CITE:a].`).join(" ");
    const r = buildPairs(many, sources);
    expect(r.pairs).toHaveLength(MAX_PAIRS);
    expect(r.truncated).toBe(5);
  });
});

describe("groundSupport", () => {
  const { pairs } = buildPairs(md, sources);

  it("keeps verdicts whose quote is in the source text, and discards the rest", () => {
    const ai = parseSupport(
      "Here you go:\n```json\n" +
        JSON.stringify({
          results: [
            { key: "p1", verdict: "supports", quote: "recalled 20% more word pairs", reason: "States the effect." },
            { key: "p2", verdict: "supports", quote: "Caffeine improved recall markedly", reason: "Made up." },
            { key: "p3", verdict: "cannot_tell", quote: null, reason: "Too general." },
          ],
        }) +
        "\n```"
    );
    const out = groundSupport(pairs, ai);
    expect(out.map((r) => [r.key, r.verdict, r.note ?? ""])).toEqual([
      ["p1", "supports", ""],
      ["p2", "cannot_tell", "quote_not_in_source"],
      ["p3", "cannot_tell", ""],
      ["p4", "cannot_tell", "no_source_text"],
    ]);
    expect(out[0].quote).toBe("recalled 20% more word pairs");
  });

  it("matches quotes despite curly quotes, dashes, case and spacing", () => {
    const p = [{ key: "p1", citeId: "x", sentence: "s", sourceTitle: "t", sourceText: "It’s a long–term   effect." }];
    const out = groundSupport(p, { results: [{ key: "p1", verdict: "partly", quote: "it's a LONG-term effect", reason: "r" }] });
    expect(out[0].verdict).toBe("partly");
  });

  it("an unreadable answer is null; a missing pair is reported", () => {
    expect(parseSupport("no json here")).toBeNull();
    expect(parseSupport('{"results":[{"key":"p1","verdict":"maybe"}]}')).toBeNull();
    expect(groundSupport(pairs, { results: [] })[0].note).toBe("not_answered");
  });

  it("fingerprints text", () => {
    expect(textFingerprint("a")).toBe(textFingerprint("a"));
    expect(textFingerprint("a")).not.toBe(textFingerprint("b"));
  });
});
