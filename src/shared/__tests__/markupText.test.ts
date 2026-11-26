import { describe, it, expect } from "vitest";
import { stripTags } from "../markupText";
import { stripMarkup } from "../retrieval/providers";

describe("stripTags", () => {
  it("keeps inline markup inside its word", () => {
    expect(stripTags("CO<sub>2</sub> and H<jats:sub>2</jats:sub>O in <i>E. coli</i>")).toBe("CO2 and H2O in E. coli");
    expect(stripTags("x<sup>2</sup> + <mml:math><mml:mi>y</mml:mi></mml:math>")).toBe("x2 + y");
  });

  it("separates block-level markup with a space", () => {
    expect(stripTags("<jats:title>Abstract</jats:title><jats:p>One.</jats:p><jats:p>Two.</jats:p>")).toBe("Abstract One. Two.");
    expect(stripTags("Line<br/>break<ul><li>a</li><li>b</li></ul>")).toBe("Line break a b");
  });

  it("collapses whitespace and leaves plain text alone", () => {
    expect(stripTags("  plain   text \n here ")).toBe("plain text here");
  });
});

describe("stripMarkup (retrieval abstracts)", () => {
  it("strips tags like stripTags and then decodes entities", () => {
    expect(stripMarkup("<p>Levels of CO<sub>2</sub> &amp; O<sub>3</sub> &lt;5%</p>")).toBe("Levels of CO2 & O3 <5%");
  });
});
