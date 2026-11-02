import { describe, it, expect } from "vitest";
import { changedSections, parseRevisionRound, responseLetter, revisionProgress, sectionsOf, splitReviews, type RevisionRound } from "../revision";

const LETTER = `Dear Dr Lovelace,

Thank you for submitting your manuscript. Decision: Major revision.

Associate Editor comments:
Please address the sample size concern raised by both reviewers.

Reviewer #1:
This is an interesting study of sleep and memory.

1. The sample size (n = 30) seems small for the
claims made in the abstract.
2) Please report effect sizes for the t-tests.

3. Figure 2 is hard to read.

Reviewer 2
- The literature review omits Walker (2017).
- Methods: how was sleep duration measured?

Comments to the Author
Referee: 3
The paper is fine.

Kind regards,
The Editor`;

describe("splitReviews", () => {
  it("splits a decision letter into comments per reviewer, keeping their wording", () => {
    expect(splitReviews(LETTER)).toEqual([
      { reviewer: "Editor", number: 1, text: "Please address the sample size concern raised by both reviewers." },
      { reviewer: "Reviewer 1", number: 1, text: "This is an interesting study of sleep and memory." },
      { reviewer: "Reviewer 1", number: 2, text: "The sample size (n = 30) seems small for the claims made in the abstract." },
      { reviewer: "Reviewer 1", number: 3, text: "Please report effect sizes for the t-tests." },
      { reviewer: "Reviewer 1", number: 4, text: "Figure 2 is hard to read." },
      { reviewer: "Reviewer 2", number: 1, text: "The literature review omits Walker (2017)." },
      { reviewer: "Reviewer 2", number: 2, text: "Methods: how was sleep duration measured?" },
      { reviewer: "Reviewer 3", number: 1, text: "The paper is fine." },
    ]);
  });

  it("finds nothing without reviewer headings, and splits paragraphs when there are no numbered points", () => {
    expect(splitReviews("Just some text with no reviewer.")).toEqual([]);
    expect(splitReviews("Referee A\nFirst paragraph.\n\nSecond paragraph\nstill second.")).toEqual([
      { reviewer: "Reviewer A", number: 1, text: "First paragraph." },
      { reviewer: "Reviewer A", number: 2, text: "Second paragraph still second." },
    ]);
  });
});

describe("what changed since the reviews", () => {
  const before = "### § Introduction\n\nOld intro.\n\n### § Methods\n\nSame.\n\n### § Limitations\n\nGone soon.";
  const after = "### § Introduction\n\nNew intro with more words.\n\n### § Methods\n\nSame.\n\n### § Effect sizes\n\nAdded.";

  it("reads sections and reports changed, added and removed ones", () => {
    expect(Object.keys(sectionsOf(before))).toEqual(["Introduction", "Methods", "Limitations"]);
    expect(changedSections(sectionsOf(before), after)).toEqual([
      { title: "Introduction", kind: "changed", wordsBefore: 2, wordsAfter: 5 },
      { title: "Effect sizes", kind: "added", wordsBefore: 0, wordsAfter: 1 },
      { title: "Limitations", kind: "removed", wordsBefore: 2, wordsAfter: 0 },
    ]);
  });
});

describe("responseLetter", () => {
  const round: RevisionRound = {
    round: 1,
    importedAt: "2026-11-02T00:00:00Z",
    baseline: {},
    comments: [
      { id: "a", reviewer: "Reviewer 1", number: 1, text: "Report effect sizes.", response: "We added Cohen's d for each test.", status: "revised", sections: ["Results"] },
      { id: "b", reviewer: "Reviewer 1", number: 2, text: "Figure 2 is hard to read.", response: "", status: "open", sections: [] },
      { id: "c", reviewer: "Reviewer 2", number: 1, text: "Cite Walker (2017).", response: "Walker (2017) studies a different population; we explain why in the Discussion.", status: "declined", sections: [] },
    ],
  };

  it("quotes each comment, gives only the author's reply, and marks unanswered ones", () => {
    const letter = responseLetter(round, { title: "Sleep and memory", journal: "J Sleep" });
    expect(letter).toContain("**Manuscript:** Sleep and memory\n**Journal:** J Sleep\n**Revision:** 1");
    expect(letter).toContain("## Reviewer 1\n\n**Comment 1.** Report effect sizes.\n\n**Response.** We added Cohen's d for each test.\n\n_Revised. Changed in: Results._");
    expect(letter).toContain("**Comment 2.** Figure 2 is hard to read.\n\n**Response.** _Not yet written._");
    expect(letter).toContain("_Not changed (reason given)_");
    expect(letter).not.toMatch(/concur|grateful|thank/i);
  });

  it("counts progress and round-trips through storage", () => {
    expect(revisionProgress(round.comments)).toMatchObject({ total: 3, done: 2 });
    expect(parseRevisionRound(JSON.stringify(round))).toEqual(round);
    expect(parseRevisionRound("nope")).toBeNull();
  });
});
