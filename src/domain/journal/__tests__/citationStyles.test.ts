import { describe, it, expect } from "vitest";
import { citedIds, formatEntry, renderManuscript, styleKey } from "../citationStyles";
import type { ReferenceRecord } from "../references";

const numpy: ReferenceRecord = {
  id: "a",
  kind: "article",
  title: "Array programming with NumPy",
  authors: [
    { family: "Harris", given: "Charles R." },
    { family: "Millman", given: "K. Jarrod" },
    { family: "van der Walt", given: "Stéfan J." },
  ],
  year: 2020,
  container: "Nature",
  volume: "585",
  issue: "7825",
  pages: "357-362",
  doi: "10.1038/s41586-020-2649-2",
  registry: "crossref",
};
const book: ReferenceRecord = {
  id: "b",
  kind: "book",
  title: "Deep learning",
  authors: [{ family: "Goodfellow", given: "Ian" }, { family: "Bengio", given: "Yoshua" }],
  year: 2016,
  publisher: "MIT Press",
  registry: "author",
};
const noYear: ReferenceRecord = { id: "c", kind: "other", title: "Field notes", authors: [{ family: "Shah" }], registry: "author" };

describe("styleKey", () => {
  it("maps profile labels and old select values; APA when unset", () => {
    expect(styleKey("APA 7")).toBe("apa");
    expect(styleKey("apa7")).toBe("apa");
    expect(styleKey("IEEE")).toBe("ieee");
    expect(styleKey("Vancouver")).toBe("vancouver");
    expect(styleKey("Chicago Author-Date")).toBe("chicago");
    expect(styleKey("mla9")).toBe("mla");
    expect(styleKey("Harvard")).toBe("harvard");
    expect(styleKey(undefined)).toBe("apa");
  });
});

describe("formatEntry", () => {
  it("writes a journal article in each style from the recorded fields", () => {
    expect(formatEntry(numpy, "apa")).toBe(
      "Harris, C. R., Millman, K. J., & van der Walt, S. J. (2020). Array programming with NumPy. *Nature*, *585*(7825), 357–362. https://doi.org/10.1038/s41586-020-2649-2"
    );
    expect(formatEntry(numpy, "ieee")).toBe(
      "C. R. Harris, K. J. Millman, and S. J. van der Walt, “Array programming with NumPy,” *Nature*, vol. 585, no. 7825, pp. 357–362, 2020. doi: 10.1038/s41586-020-2649-2."
    );
    expect(formatEntry(numpy, "vancouver")).toBe(
      "Harris CR, Millman KJ, van der Walt SJ. Array programming with NumPy. Nature. 2020;585(7825):357-362. doi:10.1038/s41586-020-2649-2"
    );
    expect(formatEntry(numpy, "harvard")).toBe(
      "Harris, C.R., Millman, K.J. and van der Walt, S.J. (2020) 'Array programming with NumPy', *Nature*, 585(7825), pp. 357–362. doi:10.1038/s41586-020-2649-2."
    );
    expect(formatEntry(numpy, "chicago")).toBe(
      "Harris, Charles R., K. Jarrod Millman, and Stéfan J. van der Walt. 2020. “Array programming with NumPy.” *Nature* 585 (7825): 357–362. https://doi.org/10.1038/s41586-020-2649-2."
    );
    expect(formatEntry(numpy, "mla")).toBe(
      "Harris, Charles R., et al. “Array programming with NumPy.” *Nature*, vol. 585, no. 7825, 2020, pp. 357–362, https://doi.org/10.1038/s41586-020-2649-2."
    );
  });

  it("writes a book, and n.d. for a missing year, with nothing invented", () => {
    expect(formatEntry(book, "apa")).toBe("Goodfellow, I., & Bengio, Y. (2016). *Deep learning*. MIT Press.");
    expect(formatEntry(book, "chicago")).toBe("Goodfellow, Ian, and Yoshua Bengio. 2016. *Deep learning*. MIT Press.");
    expect(formatEntry(noYear, "apa")).toBe("Shah. (n.d.). Field notes.");
  });
});

describe("renderManuscript", () => {
  const records = { a: numpy, b: book, c: noYear };
  const text = "Arrays matter [CITE:b] [CITE:a]. Notes [CITE:c]; unknown [CITE:zz].\n\n## References\n\nold hand-made list";

  it("author-date: one parenthesis per group, alphabetical list, old list replaced", () => {
    const out = renderManuscript(text, records, "apa");
    expect(out.markdown).toContain("Arrays matter (Goodfellow & Bengio, 2016; Harris et al., 2020). Notes (Shah, n.d.); unknown [CITE:zz].");
    expect(out.markdown).not.toContain("old hand-made list");
    expect(out.markdown).toContain("## References");
    expect(out.references.map((r) => r.slice(0, 10))).toEqual(["Goodfellow", "Harris, C.", "Shah. (n.d"]);
    expect(out.missing).toEqual(["zz"]);
  });

  it("numeric: numbered by first appearance, list in that order", () => {
    const out = renderManuscript("First [CITE:a]. Then [CITE:b][CITE:a].", records, "ieee");
    expect(out.markdown).toContain("First [1]. Then [2], [1].");
    expect(out.markdown).toMatch(/\[1\] C\. R\. Harris[\s\S]*\[2\] I\. Goodfellow/);
  });

  it("adds a/b when two sources share author and year", () => {
    const twin: ReferenceRecord = { ...numpy, id: "d", title: "Another NumPy paper" };
    const out = renderManuscript("[CITE:a] and [CITE:d]", { a: numpy, d: twin }, "apa");
    expect(out.markdown).toContain("(Harris et al., 2020b) and (Harris et al., 2020a)");
  });

  it("leaves text without citations untouched", () => {
    const plain = "No citations here.\n\n## References\n\nMy own list.";
    expect(renderManuscript(plain, records, "apa")).toEqual({ markdown: plain, references: [], missing: [] });
    expect(citedIds("[CITE:x] [CITE:y] [CITE:x]")).toEqual(["x", "y"]);
  });
});
