import { describe, it, expect } from "vitest";
import { buildJats } from "../jats";
import type { ReferenceRecord } from "../references";

const rec: ReferenceRecord = {
  id: "a",
  kind: "article",
  title: "Array programming with NumPy",
  authors: [{ family: "Harris", given: "Charles R." }],
  year: 2020,
  container: "Nature",
  volume: "585",
  pages: "357-362",
  doi: "10.1038/s41586-020-2649-2",
  registry: "crossref",
};

describe("buildJats", () => {
  const xml = buildJats({
    title: "Sleep & <memory>",
    journal: "J Tests",
    authors: [{ name: "Ada Lovelace", affiliation: "UCL", orcid: "0000-0001-2345-6789" }],
    abstract: "We tested *recall*.",
    keywords: ["sleep"],
    body: "### § Introduction\n\nArrays [CITE:a] and [CITE:ghost].\n\n#### Aims\n\n- one\n\n### § Results\n\nDone.",
    declarations: [{ label: "Funding", text: "Grant & co." }],
    records: { a: rec },
  });

  it("escapes text and marks up the front matter", () => {
    expect(xml).toContain("<article-title>Sleep &amp; &lt;memory&gt;</article-title>");
    expect(xml).toContain('<contrib-id contrib-id-type="orcid">https://orcid.org/0000-0001-2345-6789</contrib-id><name><surname>Lovelace</surname><given-names>Ada</given-names></name>');
    expect(xml).toContain('<aff id="aff1">UCL</aff>');
    expect(xml).toContain("<abstract><p>We tested <italic>recall</italic>.</p></abstract>");
    expect(xml).toContain("<kwd-group><kwd>sleep</kwd></kwd-group>");
  });

  it("nests sections, links known citations and leaves unknown ones as text", () => {
    expect(xml).toContain('<sec id="sec1"><title>Introduction</title>');
    expect(xml).toMatch(/<sec id="sec2"><title>Aims<\/title>\n<list list-type="bullet">[\s\S]*<\/sec>\n<\/sec>\n<sec id="sec3"><title>Results<\/title>/);
    expect(xml).toContain('<xref ref-type="bibr" rid="ref-a">a</xref>');
    expect(xml).toContain("[CITE:ghost]");
  });

  it("builds element-citations from the records' own fields", () => {
    expect(xml).toContain(
      '<ref id="ref-a"><element-citation publication-type="journal"><person-group person-group-type="author"><name><surname>Harris</surname><given-names>Charles R.</given-names></name></person-group><article-title>Array programming with NumPy</article-title><source>Nature</source><year>2020</year><volume>585</volume><fpage>357</fpage><lpage>362</lpage><pub-id pub-id-type="doi">10.1038/s41586-020-2649-2</pub-id></element-citation></ref>'
    );
    expect(xml).toContain("<sec><title>Funding</title><p>Grant &amp; co.</p></sec>");
  });

  it("leaves out what wasn't given", () => {
    const bare = buildJats({ title: "T", authors: [], body: "Text.", declarations: [], records: {} });
    expect(bare).not.toMatch(/<contrib-group|<abstract|<kwd-group|<back>/);
  });
});
