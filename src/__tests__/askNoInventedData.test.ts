import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Ask Scholar shows only what a source or the server reported. These modules once filled gaps with
 * random citation counts, placeholder authors and venues, invented page locators and confidence
 * scores, and a timer that advanced "progress" on its own. This keeps them out.
 */
const ROOT = path.resolve(__dirname, "../..");

const ASK_DISPLAY_FILES = [
  "src/desk/ProjectListScreen.tsx",
  "src/desk/dashboard/guideHelper.tsx",
  "src/desk/discovery/LiteratureDiscoveryWorkspace.tsx",
  "src/services/discovery/snowballSamplingService.ts",
  "src/desk/components/LiveResearchTrajectoryVisualizer.tsx",
];

const REMOVED_FILES = [
  "src/desk/components/SentenceProvenanceInspector.tsx",
  "src/desk/evidence/EvidenceSynthesisWorkspace.tsx",
  "src/desk/evidence/InteractiveForestPlot.tsx",
  "src/services/evidence/evidenceExtractionService.ts",
  "src/desk/export/ResearchExportWorkspace.tsx",
  "src/services/export/researchLatexExportService.ts",
  "src/desk/components/ResearchSplitCanvas.tsx",
  "src/desk/components/ScientificConsensusGauge.tsx",
];

const INVENTED = [
  /Scholarly Author/,
  /"Academic Publication"/,
  /Section 3\.1, p\. 4/,
  /confidenceScore/,
  /simulated timer/i,
  /citationCount:\s*\d+/,
];

const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

describe("Ask Scholar shows no invented data", () => {
  it("removed features stay removed", () => {
    expect(REMOVED_FILES.filter((rel) => fs.existsSync(path.join(ROOT, rel)))).toEqual([]);
  });

  it("no placeholder metadata, invented locators or scores in the Ask display modules", () => {
    const hits = ASK_DISPLAY_FILES.flatMap((rel) => INVENTED.filter((re) => re.test(read(rel))).map((re) => `${rel}: ${re}`));
    expect(hits).toEqual([]);
  });

  it("random numbers are used only for element ids, never for data", () => {
    const hits = ASK_DISPLAY_FILES.flatMap((rel) =>
      read(rel)
        .split("\n")
        .filter((line) => line.includes("Math.random") && !/id:\s*`/.test(line))
        .map((line) => `${rel}: ${line.trim()}`)
    );
    expect(hits).toEqual([]);
  });
});
