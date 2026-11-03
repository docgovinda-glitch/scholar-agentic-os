import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import {
  thesisCheckText,
  addChapter, countWords, missingForViva, moveChapter, removeChapter, standardChapters, thesisToMarkdown, totalWords, updateChapter,
  emptyLiteratureMatrix, UNTITLED_THESIS, type ThesisProjectData,
} from "../thesisModel";
import { buildThesisDocx, thesisFileName } from "../thesisExport";
import { Packer } from "docx";

const base = (over: Partial<ThesisProjectData> = {}): ThesisProjectData => ({
  id: "p", projectId: "p", title: "Rural Clinic Wait Times", degreeLevel: "Master's Thesis", fieldOfStudy: "Public Health",
  targetWordCount: 20000, currentWordCount: 0, researchQuestions: ["What drives the wait?"], theoreticalFramework: "", methodologicalDesign: "",
  supervisorNotes: "", literatureMatrix: emptyLiteratureMatrix(), chapters: [], ...over,
});

describe("thesis model", () => {
  it("a standard structure is sized to the budget and fills nothing else in", () => {
    const ch = standardChapters(20000);
    expect(ch.map((c) => c.title)).toEqual(["Introduction", "Literature Review", "Methodology", "Results", "Discussion and Conclusion"]);
    expect(ch.reduce((a, c) => a + c.targetWordCount, 0)).toBe(20000);
    expect(ch.every((c) => c.content === "" && c.wordCount === 0)).toBe(true);
  });

  it("editing text keeps word counts and status in step, and the total is the sum of chapters", () => {
    let ch = standardChapters(10000);
    ch = updateChapter(ch, 1, { content: "Nurse-led triage cut the median wait." });
    expect(ch[1].wordCount).toBe(6);
    expect(ch[1].status).toBe("drafting");
    expect(totalWords(ch)).toBe(6);
    expect(countWords("  a  b \n c ")).toBe(3);
  });

  it("chapters can be added, moved and removed, and stay numbered in order", () => {
    let ch = addChapter(addChapter([]));
    ch = updateChapter(ch, 0, { title: "First" });
    ch = moveChapter(ch, 0, 1);
    expect(ch.map((c) => [c.chapterNumber, c.title])).toEqual([[1, "Chapter 2"], [2, "First"]]);
    expect(moveChapter(ch, 0, -1)).toBe(ch);
    expect(removeChapter(ch, 0).map((c) => [c.chapterNumber, c.title])).toEqual([[1, "First"]]);
  });

  it("says what the viva still needs", () => {
    expect(missingForViva(base({ title: UNTITLED_THESIS, researchQuestions: [" "] }))).toEqual(["a thesis title", "at least one research question"]);
    expect(missingForViva(base())).toEqual([]);
  });
});

describe("thesis export", () => {
  const data = base({ chapters: updateChapter(standardChapters(20000), 0, { content: "## Background\n\nNurse-led triage cut the median wait.", bibliography: "Okafor, A. (2021) Triage." }) });

  it("Markdown holds the title, questions, chapter text and references; an empty chapter says so", () => {
    const md = thesisToMarkdown(data);
    expect(md).toContain("# Rural Clinic Wait Times");
    expect(md).toContain("1. What drives the wait?");
    expect(md).toContain("## Chapter 1: Introduction");
    expect(md).toContain("Nurse-led triage cut the median wait.");
    expect(md).toContain("Okafor, A. (2021) Triage.");
    expect(md).toContain("## Chapter 2: Literature Review\n\n_[Not drafted yet]_");
  });

  it("the Word file holds the same content", async () => {
    const buf = await Packer.toBuffer(buildThesisDocx(data));
    const xml = await (await JSZip.loadAsync(buf)).file("word/document.xml")!.async("string");
    const text = xml.replace(/<[^>]+>/g, " ");
    expect(text).toContain("Rural Clinic Wait Times");
    expect(text).toContain("Chapter 1: Introduction");
    expect(text).toContain("Nurse-led triage cut the median wait.");
    expect(text).toContain("[Not drafted yet]");
  });

  it("exports render [CITE:id] tags in the chosen style with one reference list, italics as italics", async () => {
    const cited = base({
      citationStyle: "apa",
      references: {
        r1: { id: "r1", kind: "article", title: "Triage and waits", authors: [{ family: "Okafor", given: "Ada" }], year: 2021, container: "BMJ Open", volume: "11", registry: "crossref" },
      },
      chapters: updateChapter(standardChapters(20000), 0, { content: "Triage cut waits [CITE:r1]." }),
    });
    const md = thesisToMarkdown(cited);
    expect(md).toContain("Triage cut waits (Okafor, 2021).");
    expect(md).toMatch(/## References\n\nOkafor, A\. \(2021\)\. Triage and waits\. \*BMJ Open\*, \*11\*/);

    const xml = await (await JSZip.loadAsync(await Packer.toBuffer(buildThesisDocx(cited)))).file("word/document.xml")!.async("string");
    const text = xml.replace(/<[^>]+>/g, " ");
    expect(text).toContain("Triage cut waits (Okafor, 2021).");
    expect(text).not.toContain("*BMJ Open*");
    // The journal name is its own italic run.
    expect(xml).toMatch(/<w:i\/>[\s\S]{0,200}?BMJ Open/);
    // Without references nothing is added.
    expect(thesisToMarkdown(data)).not.toMatch(/^## References/m);
  });

  it("file names are safe", () => {
    expect(thesisFileName("Rural Clinic: Wait/Times?", "docx")).toBe("Rural-Clinic-WaitTimes.docx");
    expect(thesisFileName("???", "md")).toBe("thesis.md");
  });
});

describe("thesisCheckText", () => {
  it("joins drafted chapters under their titles and skips undrafted ones", () => {
    const chapters = standardChapters(10_000);
    chapters[0].content = "Opening words.";
    chapters[2].content = "  Method words. ";
    expect(thesisCheckText(chapters)).toBe("## Introduction\n\nOpening words.\n\n## Methodology\n\nMethod words.");
    expect(thesisCheckText(standardChapters(10_000))).toBe("");
  });
});
