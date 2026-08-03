import { describe, it, expect } from "vitest";
import { validateOutputType } from "../validate";
import type { OutputTypeSpec } from "../types";

function minimalValidSpec(): OutputTypeSpec {
  return {
    id: "OT-99",
    version: 1,
    label: "Test Type",
    aliases: [],
    family: "short_form",
    academicLevels: ["undergraduate"],
    typicalDisciplines: ["all"],
    structure: {
      variant: "linear",
      sections: [
        { key: "body", title: "Body", required: true, countsTowardWordcount: true, guidance: "Write the body." },
      ],
      frontMatter: [],
      backMatter: [],
    },
    budget: { totalWords: { min: 500, max: 1000, typical: 750 }, distribution: { body: 1.0 } },
    sources: { targetCount: { min: 1, typical: 3 }, recencyExpectation: "any", typeMix: {} },
    citation: { defaultStyle: "apa7", commonStyles: ["apa7"] },
    intakeSchema: {
      required: [
        {
          key: "topic",
          label: "Topic",
          tier: "required",
          guidance: { whatItIs: "x", whyItMatters: "x", example: "x", defaultWithRationale: "x" },
          defaultValue: "Untitled",
          allowsProvisional: false,
        },
      ],
      recommended: [],
      optional: [],
    },
    qualityGates: [],
    workflowVariant: "short_form",
    complianceProfile: "coursework",
    exportDefaults: { format: "docx", includeToc: false },
  };
}

describe("app/atlas: validation", () => {
  it("accepts a well-formed minimal spec", () => {
    expect(validateOutputType(minimalValidSpec())).toEqual([]);
  });

  it("rejects a field missing 'what it is'", () => {
    const spec = minimalValidSpec();
    spec.intakeSchema.required[0].guidance.whatItIs = "";
    const issues = validateOutputType(spec);
    expect(issues.some((i) => i.message.includes("what it is"))).toBe(true);
  });

  it("rejects a field missing an example", () => {
    const spec = minimalValidSpec();
    spec.intakeSchema.required[0].guidance.example = "  ";
    const issues = validateOutputType(spec);
    expect(issues.some((i) => i.message.includes("example"))).toBe(true);
  });

  it("accepts a required field with no defaultValue and no allowsProvisional, AS LONG AS its guidance explains why (docs 14 §9 OT-16's funder field is exactly this case — legitimately blocking, not a data-entry omission)", () => {
    const spec = minimalValidSpec();
    spec.intakeSchema.required[0].defaultValue = undefined;
    spec.intakeSchema.required[0].allowsProvisional = false;
    spec.intakeSchema.required[0].guidance.defaultWithRationale =
      "There is no safe default here — proceeding without it would make the field's whole purpose meaningless.";
    expect(validateOutputType(spec)).toEqual([]);
  });

  it("still rejects ANY required field whose defaultWithRationale guidance is empty, regardless of whether it has a default value", () => {
    const spec = minimalValidSpec();
    spec.intakeSchema.required[0].defaultValue = undefined;
    spec.intakeSchema.required[0].allowsProvisional = false;
    spec.intakeSchema.required[0].guidance.defaultWithRationale = "";
    const issues = validateOutputType(spec);
    expect(issues.some((i) => i.message.includes("default rationale"))).toBe(true);
  });

  it("accepts a required field with no defaultValue IF it allows a provisional answer", () => {
    const spec = minimalValidSpec();
    spec.intakeSchema.required[0].defaultValue = undefined;
    spec.intakeSchema.required[0].allowsProvisional = true;
    expect(validateOutputType(spec)).toEqual([]);
  });

  it("flags a field misfiled under the wrong tier bucket", () => {
    const spec = minimalValidSpec();
    spec.intakeSchema.required[0].tier = "optional";
    const issues = validateOutputType(spec);
    expect(issues.some((i) => i.message.includes("listed under"))).toBe(true);
  });

  it("flags an empty structure", () => {
    const spec = minimalValidSpec();
    spec.structure.sections = [];
    const issues = validateOutputType(spec);
    expect(issues.some((i) => i.message.includes("no sections"))).toBe(true);
  });

  it("flags a section with no guidance text", () => {
    const spec = minimalValidSpec();
    spec.structure.sections[0].guidance = "";
    const issues = validateOutputType(spec);
    expect(issues.some((i) => i.message.includes("no guidance"))).toBe(true);
  });

  it("flags a budget distribution that sums far above 1.0", () => {
    const spec = minimalValidSpec();
    spec.budget.distribution = { body: 2.5 };
    const issues = validateOutputType(spec);
    expect(issues.some((i) => i.message.includes("distribution sums"))).toBe(true);
  });
});
