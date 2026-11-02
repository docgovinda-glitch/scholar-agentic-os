import { describe, it, expect } from "vitest";
import { figureFile, imageBytes, labelReferences, numberFigures, parseFigures, parseTableText, placeFigures, tableMarkdown, type ManuscriptFigure } from "../figures";
import { buildLatex } from "../latex";
import { buildJats } from "../jats";

// A 1×1 PNG.
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const figs: ManuscriptFigure[] = [
  { id: "a", kind: "figure", caption: "Recall by condition.", altText: "Bar chart", image: PNG },
  { id: "b", kind: "figure", caption: "Sleep stages.", altText: "" },
  { id: "t", kind: "table", caption: "Participants.", altText: "", rows: [["Group", "n"], ["Sleep", "15"], ["Wake", "15"]] },
  { id: "unused", kind: "figure", caption: "Never cited.", altText: "" },
];
const text = "Sleep helped ([FIG:b]). Table [TAB:t] lists groups; see also [FIG:a] and [FIG:b]. Broken [FIG:gone].";

describe("numberFigures", () => {
  it("numbers figures and tables separately by first mention, and reports gaps both ways", () => {
    const n = numberFigures(text, figs);
    expect(n.label).toEqual({ b: "Figure 1", a: "Figure 2", t: "Table 1" });
    expect(n.unmentioned.map((f) => f.id)).toEqual(["unused"]);
    expect(n.missing).toEqual(["[FIG:gone]"]);
    expect(labelReferences(text, n)).toBe("Sleep helped (Figure 1). Table Table 1 lists groups; see also Figure 2 and Figure 1. Broken [FIG:gone].");
  });

  it("a figure token never matches a table", () => {
    expect(numberFigures("[TAB:a]", figs).missing).toEqual(["[TAB:a]"]);
  });
});

describe("tables", () => {
  it("reads pasted spreadsheet, pipe or comma rows", () => {
    expect(parseTableText("Group\tn\nSleep\t15")).toEqual([["Group", "n"], ["Sleep", "15"]]);
    expect(parseTableText("| Group | n |\n| --- | --- |\n| Sleep | 15 |")).toEqual([["Group", "n"], ["Sleep", "15"]]);
    expect(parseTableText("Group, n\nSleep, 15")).toEqual([["Group", "n"], ["Sleep", "15"]]);
  });

  it("writes a pipe table, padding short rows", () => {
    expect(tableMarkdown([["A", "B"], ["1"]])).toBe("| A | B |\n| --- | --- |\n| 1 |  |");
  });
});

describe("placeFigures", () => {
  it("labels references and lists the mentioned objects at the end with captions", () => {
    const { markdown } = placeFigures("Text [FIG:a] and [TAB:t].", figs);
    expect(markdown).toContain("Text Figure 1 and Table 1.");
    expect(markdown).toContain("## Figures and tables");
    expect(markdown).toContain("**Figure 1.** Recall by condition. _(Image file: figure1.png.)_");
    expect(markdown).toContain("**Table 1.** Participants.\n\n| Group | n |\n| --- | --- |\n| Sleep | 15 |\n| Wake | 15 |");
    expect(markdown).not.toContain("Never cited");
  });

  it("leaves text without references alone", () => {
    expect(placeFigures("Plain.", figs).markdown).toBe("Plain.");
  });
});

describe("images and storage", () => {
  it("decodes the stored image and names its file", () => {
    const bytes = imageBytes(PNG)!;
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(figureFile(figs[0], "Figure 2")).toBe("figure2.png");
    expect(imageBytes("data:text/plain;base64,AAAA")).toBeNull();
    expect(parseFigures(JSON.stringify([...figs, { id: "bad id", kind: "figure" }]))).toHaveLength(4);
  });
});

describe("figures in LaTeX and JATS", () => {
  const base = { title: "T", authors: [], declarations: [], records: {}, figures: figs, body: "### § Results\n\nSee [FIG:a] and [TAB:t]." };

  it("LaTeX: \\ref to floats, the image file beside main.tex, tables as tabular", () => {
    const p = buildLatex({ ...base, template: "article", style: "apa" });
    expect(p.tex).toContain("See Figure~\\ref{fig:1} and Table~\\ref{tab:1}.");
    expect(p.tex).toContain("\\includegraphics[width=\\linewidth]{figure1.png}");
    expect(p.tex).toContain("\\caption{Recall by condition.}\\label{fig:1}");
    expect(p.tex).toContain("\\caption{Participants.}\\label{tab:1}");
    expect(p.tex).toContain("Group & n \\\\");
    expect(p.files.map((f) => f.name)).toEqual(["figure1.png"]);
  });

  it("JATS: xref links and fig / table-wrap in the floats group", () => {
    const xml = buildJats(base);
    expect(xml).toContain('<xref ref-type="fig" rid="fig-a">Figure 1</xref>');
    expect(xml).toContain('<fig id="fig-a"><label>Figure 1</label><caption><p>Recall by condition.</p></caption><alt-text>Bar chart</alt-text><graphic xlink:href="figure1.png"/></fig>');
    expect(xml).toContain('<table-wrap id="tab-t"><label>Table 1</label>');
    expect(xml).toContain("<thead><tr><th>Group</th><th>n</th></tr></thead>");
  });
});
