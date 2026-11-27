import { describe, expect, it } from "vitest";
import { attachClaimPassages } from "../claimPassages.ts";
import { claimKey } from "../../../../src/domain/ask/passageMatch.ts";

const sources = [
  { title: "Sleep and memory", url: "https://a.org/1", text: "Participants slept for eight hours. Sleep after learning improved recall of word pairs by a clear margin compared with wakefulness. Other findings were mixed." },
  { title: "Caffeine study", url: "https://a.org/2", text: "Caffeine improved alertness in night-shift workers." },
];

describe("attachClaimPassages", () => {
  it("matches each cited sentence to the passage of its source that backs it, from the fuller text", () => {
    const report = "Sleep after learning improved recall of word pairs compared with staying awake [1]. Caffeine had effects on recall in students [2].";
    const out = attachClaimPassages(report, sources, (s) => s.text);
    const first = out[0].claimPassages!;
    expect(first).toHaveLength(1);
    expect(first[0].passage).toMatch(/Sleep after learning improved recall of word pairs/);
    expect(first[0].key).toBe(claimKey("Sleep after learning improved recall of word pairs compared with staying awake"));
  });

  it("records a claim with no clear match as null instead of a weak passage", () => {
    const out = attachClaimPassages("Caffeine had effects on recall in students [2].", sources, (s) => s.text);
    expect(out[1].claimPassages).toEqual([expect.objectContaining({ passage: null })]);
  });

  it("reads grouped and ranged markers, and ignores numbers with no source", () => {
    const out = attachClaimPassages("Sleep after learning improved recall of word pairs [1, 2]. Recall of word pairs improved after sleep [1–2]. Also [9].", sources, (s) => s.text);
    expect(out[0].claimPassages).toHaveLength(2);
    expect(out[1].claimPassages).toHaveLength(2);
  });

  it("takes a claim in a table cell from its own cell, not the whole table", () => {
    const report = "| Study | Finding |\n|---|---|\n| Sleep study | Sleep after learning improved recall of word pairs [1] |";
    const out = attachClaimPassages(report, sources, (s) => s.text);
    expect(out[0].claimPassages![0].claim).toBe("Sleep after learning improved recall of word pairs");
  });
});
