/**
 * End-to-end regression for the QNT-4020 brief (7 questions over 4 Parts, a
 * rubric Part and a prescribed bibliography, page footers, 1,000 words).
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { generateDynamicAssignmentStructure, autoBalanceStructure, formatAcademicTopicTitle } from "../services/outlineService";
import { structureToInternalSections, stripSectionNumber } from "../types";
import { applyMarksBudget } from "../../../domain/assignment/outlineBudget";
import { structureFromAi } from "../../../domain/assignment/aiAssignmentOutline";
import { purgeLegacyTemplateText } from "../../../domain/assignment/legacyPurge";
import { parsePersonName, formatReference } from "../services/referenceListGenerator";
import { mergeAdjacentParentheticalCitations } from "../../scholarCitationEngine";
import { inlineMarkdownToHtml, inlineMarkdownRuns, selectCitedSources } from "../services/exportText";
import { buildSectionContract } from "../../../../server/src/utils/sectionContract";
import { scoreSourceRelevance, briefDomainTerms } from "../../../utils/briefSourceQueries";
import { parsePrescribedBibliography } from "../../../utils/briefQuestions";
import type { AssignmentStructure, DiscoveredSource } from "../types";

const BRIEF = fs.readFileSync(path.join(__dirname, "../../../utils/__tests__/fixtures/qnt4020-brief.txt"), "utf8");
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const build = (target = 1000) =>
  generateDynamicAssignmentStructure({ question: BRIEF, assignmentType: "coursework", academicLevel: "postgraduate", targetWordCount: target, briefText: BRIEF });

describe("outline: one section per question, nothing dropped", () => {
  it("maps Q1-Q7 to 7 sections with sub-parts inside their question (Q7 is never dropped)", () => {
    const sections = structureToInternalSections(build());
    expect(sections).toHaveLength(7);
    expect(sections[6].title).toMatch(/^7\.0 Cross-Branch Case Study: Hybrid VQE for Nitrogenase FeMoco/);
    expect(sections[0].guidance).toMatch(/\(a\).*\(b\).*\(c\)/s);
    expect(sections.every((s) => !/^\d+\.\d\s+\d+\.\d/.test(s.title))).toBe(true); // no "1.0 1.0"
  });

  it("allocates words by marks (never 40w vs 960w): clean multiples summing to exactly 1,000", () => {
    const sections = structureToInternalSections(build(1000));
    const words = sections.map((s) => s.targetWordCount);
    expect(sum(words)).toBe(1000);
    expect(Math.min(...words)).toBeGreaterThanOrEqual(100);
    expect(Math.max(...words)).toBeLessThanOrEqual(240);
    expect(words.every((w) => w % 10 === 0)).toBe(true);
    // Q5 (20 marks) > Q1 (15) > Q4 (13) > Q3 (12) >= Q2/Q6/Q7 (10)
    expect(words[4]).toBeGreaterThan(words[0]);
    expect(words[0]).toBeGreaterThan(words[3]);
    expect(words[3]).toBeGreaterThanOrEqual(words[2]);
    expect(words[1]).toBe(words[5]);
  });

  it("rescales every section when the target changes from 2,000 to 1,000", () => {
    const rescaled = autoBalanceStructure(build(2000), 1000);
    expect(sum(rescaled.headings.map((h) => h.targetWordCount))).toBe(1000);
  });

  it("adds a section for any question an AI outline left out", () => {
    const ai = JSON.stringify({
      sections: [1, 2, 3, 4, 5, 6].map((n) => ({ title: `Question ${n}`, subsections: [{ title: `Answer to Q${n}`, words: 160 }] })),
    });
    const out = structureFromAi(ai, 1000, { briefText: BRIEF })!;
    expect(out.headings.map((h) => stripSectionNumber(h.title))).toContain("Cross-Branch Case Study: Hybrid VQE for Nitrogenase FeMoco");
    expect(sum(out.headings.map((h) => h.targetWordCount))).toBe(1000);
  });

  it("keeps headings short and never prints the exam prompt or next Part header in them", () => {
    for (const h of build().headings) {
      expect(h.title.split(/\s+/).length).toBeLessThanOrEqual(13);
      expect(h.title).not.toMatch(/Marks|Part \d|Page \d|NISQ\) devices rely/i);
    }
  });
});

describe("casing, names and citations", () => {
  it("never lowercases acronyms, units or cited names", () => {
    const t = formatAcademicTopicTitle("security of RSA-2048 against QFT and GNFS (Preskill, 2018) at 15 mK for NP-complete NIST ML-KEM");
    for (const keep of ["RSA-2048", "QFT", "GNFS", "(Preskill,", "mK", "NP-complete", "NIST", "ML-KEM"]) expect(t).toContain(keep);
  });

  it("parses author names from every index format without inverting or splitting 'et al.'", () => {
    expect(parsePersonName("Chohan, Akash")).toMatchObject({ family: "Chohan", initials: "A." });
    expect(parsePersonName("Akash Chohan")).toMatchObject({ family: "Chohan", initials: "A." });
    expect(parsePersonName("Kiukas, Jukka")).toMatchObject({ family: "Kiukas", initials: "J." });
    expect(parsePersonName("Arute et al.")).toMatchObject({ family: "Arute", etAl: true });
  });

  it("formats the prescribed Arute entry from the brief, never 'al., A. e.'", () => {
    const b = parsePrescribedBibliography(BRIEF).find((x) => x.label.startsWith("Arute"))!;
    const src = { id: "a", title: b.title, authors: [...b.authors, "et al."], year: String(b.year), type: "journal", journal: b.venue, volume: b.volume, issue: b.issue, pages: b.pages, doi: b.doi, mainFinding: "", suggestedUse: "", citation: "", status: "kept" } as DiscoveredSource;
    const ref = formatReference(src, "harvard", 0);
    expect(ref).toMatch(/^Arute, F\. et al\. \(2019\) 'Quantum supremacy using a programmable superconducting processor', \*Nature\*/);
    expect(ref).not.toMatch(/al\., A\. e\./);
  });

  it("merges adjacent author-date citations into one bracket", () => {
    expect(mergeAdjacentParentheticalCitations("NISQ limits (Arute et al., 2019) (Kjaergaard et al., 2020).")).toBe("NISQ limits (Arute et al., 2019; Kjaergaard et al., 2020).");
    expect(mergeAdjacentParentheticalCitations("(Abedi and Schmitt, 2026), (Leclerc et al., 2026)")).toBe("(Abedi and Schmitt, 2026; Leclerc et al., 2026)");
  });
});

describe("drafting contract", () => {
  it("asks for every sub-part and the citations the question names, and avoids a fresh introduction mid-report", () => {
    const contract = buildSectionContract({
      prompt: "Focus: Comparative Analysis (Preskill, 2018). (a) Compare transmon and trapped-ion (b) Explain gate fidelity (Arute et al., 2019) (c) Evaluate scalability (Kjaergaard et al., 2020)",
      sectionIndex: 2,
      sectionCount: 7,
      sources: [
        { title: "NISQ", authors: ["Preskill, J."], year: "2018" },
        { title: "Supremacy", authors: ["Arute, F.", "et al."], year: "2019" },
        { title: "SC qubits", authors: ["Kjaergaard, M."], year: "2020" },
      ],
      writingStyle: { preset: "custom", customSampleText: "I write short sentences. I like clear examples." },
    });
    expect(contract).toMatch(/Answer EVERY sub-part \(\(a\), \(b\), \(c\)\)/);
    expect(contract).toMatch(/\[1\] Preskill \(2018\)/);
    expect(contract).toMatch(/\[2\] Arute et al\. \(2019\)/);
    expect(contract).toMatch(/\[3\] Kjaergaard et al\. \(2020\)/);
    expect(contract).toMatch(/Do not write a general introduction/);
    expect(contract).toMatch(/I write short sentences/);
  });
});

describe("export and sources hygiene", () => {
  it("renders real italics and strips LaTeX escapes", () => {
    expect(inlineMarkdownToHtml("In *Physical Review Letters*, a \\$3\\$-noisy channel")).toBe("In <em>Physical Review Letters</em>, a 3-noisy channel");
    expect(inlineMarkdownRuns("See *Nature* now")).toEqual([{ text: "See " }, { text: "Nature", italics: true }, { text: " now" }]);
  });

  it("keeps only cited or prescribed sources, deduplicated", () => {
    const mk = (id: string, author: string, year: string, title: string, extra: Partial<DiscoveredSource> = {}) =>
      ({ id, title, authors: [author], year, type: "journal", mainFinding: "", suggestedUse: "", citation: "", status: "kept", ...extra }) as DiscoveredSource;
    const picked = selectCitedSources(
      [
        mk("1", "Gupta, R.", "2020", "Topological codes"),
        mk("2", "Gupta, R.", "2020", "Topological codes"),
        mk("3", "Rahman, K.", "2020", "Sentiment analysis on noisy Bangla texts"),
        mk("4", "Shor, P.W.", "1994", "Algorithms for quantum computation", { prescribedInBrief: true }),
      ],
      "Surface codes help (Gupta, 2020)."
    );
    expect(picked.map((p) => p.id)).toEqual(["1", "4"]);
  });

  it("rejects off-topic papers that merely share a word with a query", () => {
    const domain = briefDomainTerms(BRIEF);
    expect(domain).toContain("quantum");
    const q = ["quantum noisy comparative physical realisations"];
    expect(scoreSourceRelevance({ title: "Sentiment Analysis on Noisy Bangla Texts" }, domain, q)).toBe(0);
    expect(scoreSourceRelevance({ title: "Ideal Language Signs and their Physical Realisations" }, domain, q)).toBe(0);
    expect(scoreSourceRelevance({ title: "Removal Noise from Remote Sensing Image" }, domain, q)).toBe(0);
    expect(scoreSourceRelevance({ title: "Superconducting qubits: current state of play", venue: "Annual Review of Condensed Matter Physics" }, domain, ["superconducting transmon qubit"])).toBeGreaterThan(0);
  });

  it("purges legacy template text from saved projects", () => {
    const answers = {
      target_frameworks: JSON.stringify(["Bilateral Economic Interdependence Model", "Commercial Peace Theory"]),
      assignment_structure: JSON.stringify({ headings: [{ subheadings: [{ guidance: 'Focus: Analyze core conceptual mechanisms, theoretical grounding (Bilateral Economic Interdependence Model), and analytical dimensions for: "Does trade reduce conflict".' }] }] }),
    };
    const out = purgeLegacyTemplateText(answers);
    expect(JSON.stringify(out)).not.toMatch(/Bilateral Economic|core conceptual mechanisms/);
    expect(out.assignment_structure).toContain("Focus: Does trade reduce conflict");
    expect(JSON.parse(out.target_frameworks as string)).toEqual(["Commercial Peace Theory"]);
  });
});

describe("AI outline budgets", () => {
  it("re-budgets an AI outline by marks even when the AI invented 40w / 960w", () => {
    const s: AssignmentStructure = {
      version: 1, isConfirmed: false, targetWordCount: 1000, totalAllocated: 1000, source: "ai",
      headings: ["Comparative Analysis of Qubit Physical Realisations", "Emerging Neutral Atom & Photonic Paradigms", "Complexity Classes and BQP Boundaries", "Quantum Speedup Mechanisms: Shor vs. Grover", "Surface Codes, Syndrome Measurement & Thresholds", "QKD vs. Post-Quantum Cryptography", "Cross-Branch Case Study: Hybrid VQE for Nitrogenase FeMoco"].map((t, i) => ({
        id: `h${i}`, number: i + 1, title: `${i + 1}.0 ${t}`, targetWordCount: i === 6 ? 760 : 40,
        subheadings: [{ id: `s${i}`, headingId: `h${i}`, numberStr: `${i + 1}.1`, title: "Key points and evidence", targetWordCount: i === 6 ? 760 : 40, currentWordCount: 0 }],
      })),
    } as AssignmentStructure;
    const words = applyMarksBudget(s, BRIEF).headings.map((h) => h.targetWordCount);
    expect(sum(words)).toBe(1000);
    expect(Math.max(...words)).toBeLessThan(300);
    expect(Math.min(...words)).toBeGreaterThanOrEqual(100);
  });
});
