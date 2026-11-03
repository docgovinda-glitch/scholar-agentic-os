import { describe, it, expect } from "vitest";
import { REPORTING_CHECKLISTS } from "../reportingChecklistData";
import { checklistById, checklistCsv, checklistProgress, checklistRows, parseChecklistState, suggestChecklist } from "../reportingChecklist";

describe("checklist data, as published", () => {
  it.each([
    ["consort", 30, 42, "1a", "Identification as a randomised trial"],
    ["prisma", 27, 42, "1", "Identify the report as a systematic review."],
    ["strobe", 22, 34, "1a", "Indicate the study’s design with a commonly used term in the title or the abstract"],
    ["arrive", 21, 38, "1a", "The groups being compared, including control groups. If no control group has been used, the rationale should be stated."],
  ] as const)("%s: %i items in %i rows, wording kept", (id, items, rows, firstId, firstText) => {
    const c = checklistById(id)!;
    expect(c.items).toHaveLength(rows);
    expect(new Set(c.items.map((i) => i.id.replace(/[a-z]$/, ""))).size).toBe(items);
    expect(c.items[0]).toMatchObject({ id: firstId, text: firstText });
    expect(new Set(c.items.map((i) => i.id)).size).toBe(rows);
    expect(c.citation).toMatch(/doi:10\./);
    for (const i of c.items) expect(i.text.trim().length).toBeGreaterThan(3);
  });

  it("keeps sub-item leads and study-type variants as the originals print them", () => {
    const arrive = checklistById("arrive")!;
    expect(arrive.items.find((i) => i.id === "9d")).toEqual({
      id: "9d",
      section: "Experimental procedures",
      lead: "For each experimental group, including controls, describe the procedures in enough detail to allow others to replicate them, including:",
      text: "Why (provide rationale for procedures).",
    });
    expect(checklistById("strobe")!.items.find((i) => i.id === "15")!.text.split("\n")).toEqual([
      "Cohort study—Report numbers of outcome events or summary measures over time",
      "Case-control study—Report numbers in each exposure category, or summary measures of exposure",
      "Cross-sectional study—Report numbers of outcome events or summary measures",
    ]);
    expect(checklistById("prisma")!.items.at(-1)!.id).toBe("27");
    expect(checklistById("consort")!.items.at(-1)).toMatchObject({ id: "30", section: "Limitations" });
    expect(REPORTING_CHECKLISTS.map((c) => c.id)).toEqual(["consort", "prisma", "strobe", "arrive"]);
  });
});

describe("suggestChecklist", () => {
  it("suggests from the study description, or nothing when unclear", () => {
    expect(suggestChecklist("Research article", "A randomised controlled trial of sleep")).toBe("consort");
    expect(suggestChecklist("A systematic review and meta-analysis")).toBe("prisma");
    expect(suggestChecklist("", "Male C57BL/6 mice were housed")).toBe("arrive");
    expect(suggestChecklist("", "A prospective cohort of 2,000 adults")).toBe("strobe");
    expect(suggestChecklist("Essay on epistemology")).toBeNull();
  });
});

describe("progress and the completed file", () => {
  const consort = checklistById("consort")!;
  const state = parseChecklistState(
    JSON.stringify({
      checklistId: "consort",
      entries: {
        "1a": { status: "reported", location: "Title", note: "" },
        "2": { status: "reported", location: "", note: "" },
        "3": { status: "not_applicable", location: "", note: "" },
        "4": { status: "not_applicable", location: "", note: "No data sharing; consent did not cover it." },
      },
    })
  );

  it("counts what is done and lists what is incomplete", () => {
    expect(checklistProgress(consort, state)).toEqual({
      total: 42,
      reported: 2,
      notApplicable: 2,
      open: 38,
      problems: ["Item 2: marked reported but no location given.", "Item 3: marked not applicable without a reason."],
    });
  });

  it("writes rows and a CSV with the source cited", () => {
    const rows = checklistRows(consort, state);
    expect(rows[0]).toEqual({ id: "1a", section: "Title and structured abstract", text: "Identification as a randomised trial", where: "Title", note: "" });
    expect(rows.find((r) => r.id === "4")!.where).toBe("Not applicable: No data sharing; consent did not cover it.");
    const csv = checklistCsv(consort, state, "Sleep and memory");
    expect(csv.split("\r\n")[0]).toBe('"CONSORT 2025 checklist for: Sleep and memory"');
    expect(csv).toContain("doi:10.1136/bmj-2024-081123");
    expect(csv).toContain('"Title and structured abstract","1a","Identification as a randomised trial","Title",""');
    expect(parseChecklistState("nope")).toBeNull();
  });
});
