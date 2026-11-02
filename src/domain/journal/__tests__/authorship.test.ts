import { describe, it, expect } from "vitest";
import { CREDIT_ROLES, checkAuthors, creditStatement, initialsName, isValidOrcid, newAuthor, normalizeOrcid, type ManuscriptAuthor } from "../authorship";

const ada: ManuscriptAuthor = {
  id: "a",
  firstName: "Ada",
  surname: "Lovelace",
  affiliation: "UCL",
  email: "ada@ucl.ac.uk",
  orcid: "0000-0002-1825-0097",
  isCorresponding: true,
  creditRoles: ["Writing – original draft", "Conceptualization"],
};
const charles: ManuscriptAuthor = { ...ada, id: "c", firstName: "Charles", surname: "Babbage", email: "", orcid: "", isCorresponding: false, creditRoles: ["Software"] };

describe("CRediT", () => {
  it("has the 14 NISO roles", () => {
    expect(CREDIT_ROLES).toHaveLength(14);
    expect(CREDIT_ROLES[0]).toBe("Conceptualization");
    expect(CREDIT_ROLES[13]).toBe("Writing – review & editing");
  });

  it("writes the statement in byline order, roles in CRediT order", () => {
    expect(creditStatement([ada, charles])).toBe("A. Lovelace: Conceptualization, Writing – original draft. C. Babbage: Software.");
    expect(creditStatement([{ ...charles, creditRoles: [] }])).toBe("");
    expect(initialsName({ firstName: "Jean-Paul Marie", surname: "Sartre" })).toBe("J.-P. M. Sartre");
  });
});

describe("ORCID iD", () => {
  it("checks the ISO 7064 check digit, including X", () => {
    expect(isValidOrcid("0000-0002-1825-0097")).toBe(true);
    expect(isValidOrcid("0000-0001-5109-3700")).toBe(true);
    expect(isValidOrcid("0000-0002-1694-233X")).toBe(true);
    expect(isValidOrcid("0000-0002-1825-0098")).toBe(false);
    expect(isValidOrcid("1234")).toBe(false);
  });

  it("normalises pasted forms", () => {
    expect(normalizeOrcid("https://orcid.org/0000000218250097")).toBe("0000-0002-1825-0097");
    expect(normalizeOrcid(" 0000 0002 1694 233x ")).toBe("0000-0002-1694-233X");
  });
});

describe("checkAuthors", () => {
  it("passes a complete author list", () => {
    expect(checkAuthors([ada, charles])).toEqual([]);
  });

  it("says exactly what is missing", () => {
    expect(checkAuthors([]).map((p) => p.message)).toEqual(["Add at least one author."]);
    const messages = checkAuthors([
      { ...newAuthor("x"), firstName: "Bo" },
      { ...ada, id: "y", isCorresponding: false, orcid: "0000-0002-1825-0098", email: "not-an-email" },
    ]).map((p) => p.message);
    expect(messages).toEqual([
      "Choose a corresponding author.",
      "Bo: first name and surname are both needed.",
      "Bo: add an affiliation.",
      "Bo: choose at least one CRediT role.",
      "Ada Lovelace: the email address doesn't look right.",
      "Ada Lovelace: the ORCID iD's check digit doesn't match; check it at orcid.org.",
    ]);
    expect(checkAuthors([ada, { ...charles, isCorresponding: true, email: "c@b.org" }]).map((p) => p.message)).toEqual(["Only one author can be the corresponding author."]);
  });
});
