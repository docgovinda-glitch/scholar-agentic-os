import { describe, it, expect } from "vitest";
import { ChicagoNotesFormatter } from "../chicagoNotes";
import type { CanonicalReference } from "../../model/reference";

const formatter = new ChicagoNotesFormatter();

// CMOS 17 worked example (book): Rick Beard, The Muse: A History of Music
// (Random House, 2009), 9-18. -- place of publication omitted, see the
// formatter's module comment for why.
const book: CanonicalReference = {
  kind: "Book",
  title: "The Muse: A History of Music",
  authors: [{ firstName: "Rick", lastName: "Beard", order: 0 }],
  source: "Random House",
  publisher: "Random House",
  publicationDate: "2009-01-01",
  year: "2009",
};

// CMOS 17 worked example (journal article): John Stein, "Music in Plato's
// Republic," Music Journal 44 (2009): 442.
const article: CanonicalReference = {
  kind: "JournalArticle",
  title: "Music in Plato's Republic",
  authors: [{ firstName: "John", lastName: "Stein", order: 0 }],
  source: "Music Journal",
  journal: "Music Journal",
  volume: "44",
  publicationDate: "2009-01-01",
  year: "2009",
  pages: "439-58",
};

describe("ChicagoNotesFormatter: identity", () => {
  it("has a distinct id from the author-date Chicago formatter", () => {
    expect(formatter.id).toBe("chicago-notes-bibliography");
    expect(formatter.id).not.toBe("chicago-author-date");
  });
});

describe("ChicagoNotesFormatter: in-text marker", () => {
  it("is the plain footnote number, not a parenthetical", () => {
    expect(formatter.formatInText(book, { position: 1 })).toBe("1");
    expect(formatter.formatInText(book, { position: 7 })).toBe("7");
  });

  it("defaults to 1 when no position is given", () => {
    expect(formatter.formatInText(book)).toBe("1");
  });
});

describe("ChicagoNotesFormatter: full notes", () => {
  it("formats a book's full note per CMOS 17's worked example (minus place of publication)", () => {
    expect(formatter.formatNote(book, { locator: "9-18" })).toBe(
      "Rick Beard, *The Muse: A History of Music* (Random House, 2009), 9-18."
    );
  });

  it("formats a journal article's full note per CMOS 17's worked example", () => {
    expect(formatter.formatNote(article, { locator: "442" })).toBe(
      'John Stein, "Music in Plato\'s Republic," *Music Journal* 44 (2009): 442.'
    );
  });

  it("falls back to the reference's own page range when no locator is given", () => {
    expect(formatter.formatNote(article)).toContain(": 439-58.");
  });
});

describe("ChicagoNotesFormatter: short notes", () => {
  it("formats a book's short note: last name, short title (subtitle dropped), locator", () => {
    expect(formatter.formatShortNote(book, { locator: "22" })).toBe("Beard, *The Muse*, 22.");
  });

  it("formats a journal article's short note", () => {
    expect(formatter.formatShortNote(article, { locator: "450-52" })).toBe(
      'Stein, "Music in Plato\'s Republic," 450-52.'
    );
  });

  it("ends with a period inside the quotes when there is no locator", () => {
    const noPages: CanonicalReference = { ...article, pages: undefined };
    expect(formatter.formatShortNote(noPages)).toBe('Stein, "Music in Plato\'s Republic."');
  });
});

describe("ChicagoNotesFormatter: bibliography", () => {
  it("formats a book bibliography entry: only the first author inverted", () => {
    expect(formatter.formatBibliography(book)).toBe("Beard, Rick. *The Muse: A History of Music*. Random House, 2009.");
  });

  it("formats a journal article bibliography entry with the full page range", () => {
    expect(formatter.formatBibliography(article)).toBe(
      'Stein, John. "Music in Plato\'s Republic." *Music Journal* 44 (2009): 439-58.'
    );
  });

  it("formatReferenceList joins bibliography entries with a blank line, in the given order", () => {
    const list = formatter.formatReferenceList([book, article]);
    expect(list).toBe(formatter.formatBibliography(book) + "\n\n" + formatter.formatBibliography(article));
  });
});

describe("ChicagoNotesFormatter: author counts", () => {
  const twoAuthors: CanonicalReference = {
    ...book,
    authors: [
      { firstName: "Rick", lastName: "Beard", order: 0 },
      { firstName: "Ana", lastName: "Kim", order: 1 },
    ],
  };
  const fourAuthors: CanonicalReference = {
    ...book,
    authors: [
      { firstName: "Rick", lastName: "Beard", order: 0 },
      { firstName: "Ana", lastName: "Kim", order: 1 },
      { firstName: "Lee", lastName: "Ford", order: 2 },
      { firstName: "Sam", lastName: "Diaz", order: 3 },
    ],
  };

  it("joins two authors with 'and' in a full note", () => {
    expect(formatter.formatNote(twoAuthors)).toMatch(/^Rick Beard, and Ana Kim, \*/);
  });

  it("abbreviates four or more authors to the first plus 'et al.' in a full note", () => {
    expect(formatter.formatNote(fourAuthors)).toMatch(/^Rick Beard et al\., \*/);
  });

  it("inverts only the first of two authors in a bibliography entry", () => {
    expect(formatter.formatBibliography(twoAuthors)).toMatch(/^Beard, Rick, and Ana Kim\. \*/);
  });

  it("abbreviates four or more authors to the first plus 'et al.' in a bibliography entry", () => {
    expect(formatter.formatBibliography(fourAuthors)).toMatch(/^Beard, Rick, et al\. \*/);
  });
});

describe("ChicagoNotesFormatter: short-title heuristic", () => {
  it("drops a subtitle after a colon, keeping what precedes it (CMOS's own worked example)", () => {
    expect(formatter.formatShortNote(book, { locator: "1" })).toContain("*The Muse*");
  });

  it("caps an unpunctuated long title at five words", () => {
    const longTitle: CanonicalReference = {
      ...book,
      title: "One Two Three Four Five Six Seven",
    };
    expect(formatter.formatShortNote(longTitle, { locator: "1" })).toContain("*One Two Three Four Five*");
  });
});
