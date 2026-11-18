/**
 * Coursework (OT-01) prompts. Owned by the single brain: routes get them only via
 * scholarBrain.courseworkPrompts and never write prompt text themselves.
 * Moved verbatim from the assignment routes; inputs are the brief and project data they used.
 */
/**
 * What the Coursework copilot reads from the project. Saved answers are free-form
 * JSON, so every field is optional; the prompt prints only what is there.
 */
export interface CopilotSource { id: string; isExcluded?: boolean; title?: string; authors?: string[]; year?: string | number; venue?: string; relevanceRationale?: string; abstract?: string; prescribedInBrief?: boolean; status?: string }
export interface CopilotDeck { title?: string; fileName?: string; extractedConcepts?: string[] }
export interface CopilotEvidence { claimText?: string; sourceTitle?: string; sourceId?: string; quoteText?: string }
export interface CopilotSection { id?: string; title?: string; targetWordCount?: number; currentWordCount?: number; guidance?: string; linkedEvidenceIds?: string[]; draftContent?: string }
export interface CopilotPeel { sectionId?: string; point?: string; evidence?: string; explanation?: string; link?: string }
export interface CopilotAudit { overallScore?: number; bandLabel?: string; overallBand?: string; readinessPercentage?: number; priorityFixes?: string[]; unresolvedCitations?: CopilotCitation[] }
export type CopilotCitation = string | { rawCitation?: string };
export interface CopilotAnalysis { commandVerbs?: unknown; keyConcepts?: unknown; scopeBoundaries?: unknown; markingRubric?: unknown[] }
export interface CopilotContext {
  normalizedPhase: "understand" | "sources" | "drafting" | "submission";
  question: string;
  academicLevel: string;
  targetWordCount: number;
  citationStyle: string;
  assignmentType: string;
  analysis: CopilotAnalysis;
  rubricCriteria: unknown[];
  keptSources: CopilotSource[];
  lectureSlides: CopilotDeck[];
  evidenceItems: CopilotEvidence[];
  currentTotalWords: number;
  outline: CopilotSection[];
  peelSections: CopilotPeel[];
  rubricAudit: CopilotAudit | null;
  unresolvedCitations: CopilotCitation[];
}

import { buildSectionContract, type ContractSource } from "../../utils/sectionContract.ts";
import { paragraphRange } from "../../utils/sectionStream.ts";
import type { EvidenceInput, ExtractInput, Extraction, ReviewInput, SourceForAnalysis } from "../../../../src/domain/assignment/assignmentAgent.ts";
import type { AssignmentOutlineContext } from "../../../../src/domain/assignment/aiAssignmentOutline.ts";
import { structureLens } from "../../../../src/domain/assignment/briefScoping.ts";


export function streamSectionPrompt({ sectionTitle, academicFunction, targetWordCount, budgetRange, academicLevel, citationStyle, thesis, project, assignmentTopic, revisionInstruction, existingBlock, evidencePackPrompt, evidenceBlock, agentBlock, sectionGuidance, sectionIndex, sectionCount, outlineTitles, previousTail, mappedSources, writingStyle, frameworkGuidelines, isShortQA,  }: { sectionTitle: unknown; academicFunction: unknown; targetWordCount: number; budgetRange: { min: number; max: number }; academicLevel: unknown; citationStyle: unknown; thesis: unknown; project: { answers: Record<string, unknown> }; assignmentTopic: unknown; revisionInstruction: unknown; existingBlock: unknown; evidencePackPrompt: unknown; evidenceBlock: unknown; agentBlock: unknown; sectionGuidance: unknown; sectionIndex: unknown; sectionCount: unknown; outlineTitles: unknown; previousTail: unknown; mappedSources: ContractSource[]; writingStyle: unknown; frameworkGuidelines: unknown; isShortQA: unknown;  }): string {
  return `You are the Scholar Core Grounded Academic Drafting Agent.
Write the section prose for: "${sectionTitle}".
Academic Function: ${academicFunction}
WORD BUDGET: ${targetWordCount} words (acceptable range ${budgetRange.min}-${budgetRange.max}). Write a complete, cohesive, well-cited section that lands inside that range and ends on a finished sentence; never stop mid-sentence and never pad.
Academic Level: ${academicLevel}
Citation Style: ${citationStyle}
Central Thesis: "${thesis || String(project.answers["assignment_thesis"] || project.answers["thesis_statement"] || "")}"
Assignment Topic: "${assignmentTopic}"

${revisionInstruction}
${existingBlock}
${evidencePackPrompt ? evidenceBlock : `BOUND EVIDENCE (Use these sources for in-text citations; do NOT fabricate external sources):\n${evidenceBlock || "Use standard scholarly reasoning."}`}
${agentBlock}

${buildSectionContract({
  prompt: String(sectionGuidance || ""),
  sectionIndex: Number.isFinite(Number(sectionIndex)) ? Number(sectionIndex) : undefined,
  sectionCount: Number.isFinite(Number(sectionCount)) ? Number(sectionCount) : undefined,
  outlineTitles: Array.isArray(outlineTitles) ? outlineTitles.map(String).slice(0, 12) : undefined,
  previousTail: typeof previousTail === "string" ? previousTail : undefined,
  sources: mappedSources,
  writingStyle: writingStyle && typeof writingStyle === "object" ? (writingStyle as { preset?: string; customSampleText?: string }) : undefined,
})}

${frameworkGuidelines}

PARAGRAPH STRUCTURE (mandatory): ${isShortQA ? "write 1-2 paragraphs" : `write ${paragraphRange(targetWordCount)} distinct academic paragraphs`} separated by ONE BLANK LINE (two newline characters). Each paragraph opens with a topic sentence, then explains the technical point, then brings cited evidence, then ends on a transition into the next idea. Never return one long unbroken block and never a single fragment.

Output ONLY the section text in clean academic Markdown prose. Do not print a heading for the section.`;
}

/** When a draft is short of its budget: continue it, never repeat it. */
export function streamSectionContinuePrompt({ prompt, draft, missingWords }: { prompt: string; draft: string; missingWords: number }): string {
  const paragraphs = missingWords > 180 ? "two new paragraphs" : "one new paragraph";
  return `${prompt}\n\nTHE SECTION BELOW IS ${missingWords} WORDS SHORT OF ITS BUDGET. Write ONLY the continuation: ${paragraphs} of about ${missingWords} words that extend the argument with further analysis of the same question, using the same citation tokens where they apply. Do not repeat, summarise or restate the text below, add no heading, and write only text that follows on from its last sentence.\nSECTION SO FAR:\n${draft}`;
}

export function streamSectionSystemPrompt({ scholarlyDirectives }: { scholarlyDirectives: unknown }): string {
  return `You are the Scholar Core Grounded Academic Drafting Agent.\n\n${scholarlyDirectives}`;
}

/** The section's current text, sent with a revision request. */
export function streamSectionExistingBlock({ existingContent, revisionPrompt }: { existingContent?: string; revisionPrompt?: string }): string {
  if (!existingContent || !revisionPrompt) return "";
  return `EXISTING DRAFT CONTENT TO REVISE:\n"""\n${existingContent}\n"""\nPlease revise and upgrade this draft following the revision focus above while preserving accurate empirical citations.\n`;
}

export function streamSectionRevisionInstruction({ revisionPrompt }: { revisionPrompt: unknown }): string {
  return revisionPrompt === "deepen"
      ? "REVISION FOCUS: Deepen analytical critique. Minimize passive descriptive text and amplify dialectical interrogation of theoretical assumptions."
      : revisionPrompt === "expand"
      ? "REVISION FOCUS: Expand scholarly elaboration. Introduce detailed comparative nuances while maintaining empirical citation grounding."
      : revisionPrompt === "condense"
      ? "REVISION FOCUS: Condense prose. Tighten argumentation and eliminate redundancies to fit the exact target word count."
      : revisionPrompt === "citations"
      ? "REVISION FOCUS: Reinforce citation grounding. Seamlessly integrate in-text citations from the bound sources to substantiate claims and strengthen academic credibility."
      : revisionPrompt === "tone"
      ? "REVISION FOCUS: Refine the academic tone and register. Keep every claim, citation and the word count; improve precision, formality and flow."
      : revisionPrompt === "smooth"
      ? "REVISION FOCUS: Enhance academic transitions and cohesion. Craft seamless transitional linkages between paragraphs and ensure strong analytical flow."
      : revisionPrompt
      ? `REVISION FOCUS: ${revisionPrompt}`
      : "";
}

export function streamSectionFrameworkGuidelines({ isShortQA, mappedSources, citationStyle }: { isShortQA: unknown; mappedSources: ReadonlyArray<{ id?: unknown }>; citationStyle: unknown }): string {
  return isShortQA
      ? `TUTORIAL & CASE STUDY Q&A GUIDELINES:
- Directly answer the question in concise, conversational, and analytically grounded prose (~100-150 words).
- Do NOT generate generic dissertation introductions, conclusion filler, artificial section summaries, or meta-commentary.
- STRICT CITATION CONVENTION: You are strictly PROHIBITED from formatting in-text citations as (Author, Year) or outputting a "References" section. Use ONLY bracket tokens like [1], [2], or token IDs like [${mappedSources[0]?.id || "ev-uuid"}].`
      : `MANDATORY PEEL PARAGRAPH FRAMEWORK:
- Point: Distinct topic sentence advancing the central thesis.
- Evidence: Grounded empirical citations referenced SOLELY via bracket tokens like [1], [2], or token IDs like [${mappedSources[0]?.id || "ev-uuid"}].
- STRICT CITATION CONVENTION: Do NOT format author-year in-text citations or include a "References" section. All citations will be compiled deterministically by the Citation Interceptor according to ${citationStyle}.
- Explanation: critical analysis and evaluation of the evidence, more than description.
- Link: Clear concluding transition linking back to the primary assessment prompt.`;
}

/**
 * The phase copilot's persona and scoped context (Advisor / Librarian / Scribe / Examiner).
 * Inputs are the project's saved answers as the route reads them (free-form JSON).
 */
export function copilotPersona({ normalizedPhase, question, academicLevel, targetWordCount, citationStyle, assignmentType, analysis, rubricCriteria, keptSources, lectureSlides, evidenceItems, currentTotalWords, outline, peelSections, rubricAudit, unresolvedCitations }: CopilotContext): { personaName: string; personaRole: string; scopedContextSummary: string; systemPrompt: string } {
  let personaName = "Advisor";
  let personaRole = "Assignment Brief & Rubric Guidance";
  let scopedContextSummary = "";
  let systemPrompt = "";

  if (normalizedPhase === "understand") {
    personaName = "Advisor";
    personaRole = "Assignment Brief & Rubric Guidance";
    scopedContextSummary = `
PHASE 1 BRIEF & RUBRIC STATE:
- Assignment Topic / Question: "${question}"
- Academic Level: ${academicLevel}
- Target Word Count: ${targetWordCount.toLocaleString()} words
- Citation Style: ${citationStyle.toUpperCase()}
- Assignment Type: ${assignmentType}
- Command Verbs: ${JSON.stringify(analysis.commandVerbs || [])}
- Key Concepts: ${JSON.stringify(analysis.keyConcepts || [])}
- Scope Boundaries: ${JSON.stringify(analysis.scopeBoundaries || {})}
- Rubric Criteria: ${JSON.stringify(rubricCriteria || [])}
`;
    systemPrompt = `You are the Advisor, the Academic Brief & Rubric Guidance Copilot in Scholar OS.
Your role is to guide the student in understanding their assignment brief, deconstructing command verbs (e.g. "Critically evaluate", "Analyze", "Examine"), mapping learning outcomes, and clarifying university marking criteria.
Always ground your answers in the student's exact brief, target word count (${targetWordCount}), academic level (${academicLevel}), and citation style (${citationStyle}).
Provide rigorous, structured, academic advice in concise markdown.`;
  } else if (normalizedPhase === "sources") {
    personaName = "Librarian";
    personaRole = "Scholarly Literature & Sourcing";
    scopedContextSummary = `
PHASE 2 SOURCES & EVIDENCE STATE:
- Approved / Kept Literature Sources (${keptSources.length} sources):
${keptSources.map((s, i) => `  [${i + 1}] "${s.title}" (${s.authors?.join(", ") || "Unknown"}, ${s.year || "n.d."}) - ${s.venue || "Scholarly Source"}. Relevance: ${s.relevanceRationale || s.abstract?.slice(0, 150) || "Approved"}`).join("\n") || "  (No approved sources yet)"}
- Uploaded Lecture Slides & Concepts (${lectureSlides.length} decks):
${lectureSlides.map((d) => `  - Deck: "${d.title || d.fileName}". Key Concepts: ${(d.extractedConcepts || []).join(", ") || "Lecture notes"}`).join("\n") || "  (No lecture slides uploaded)"}
- Verified Evidence Ledger (${evidenceItems.length} claims):
${evidenceItems.map((e, i) => `  [E${i + 1}] Claim: "${e.claimText}". Source: "${e.sourceTitle || e.sourceId}". Quote: "${e.quoteText?.slice(0, 120)}..."`).join("\n") || "  (No evidence items added)"}
`;
    systemPrompt = `You are the Librarian, the Scholarly Literature & Sourcing Copilot in Scholar OS.
Your role is to help the student curate peer-reviewed academic literature, synthesize concepts from university lecture slides, and construct verified evidence cards with grounded citations.
Always ground your responses in their approved literature, slide topics, and evidence ledger.
Help evaluate empirical validity, identify theoretical debates, and bridge lecture concepts to peer-reviewed sources.`;
  } else if (normalizedPhase === "drafting") {
    personaName = "Scribe";
    personaRole = "Academic Drafting & Synthesis";
    scopedContextSummary = `
PHASE 3 ACTIVE PEEL DRAFTING STATE:
- Target Word Budget: ${targetWordCount.toLocaleString()} words (Current Drafted: ${currentTotalWords.toLocaleString()} words)
- Sections & PEEL Decompositions (${outline.length} sections):
${outline.map((sec, i) => {
  const peel = peelSections.find((p) => p.sectionId === sec.id) ?? ({} as CopilotPeel);
  return `  Section ${i + 1}: "${sec.title}" [Target: ${sec.targetWordCount || 0}w, Current: ${sec.currentWordCount || 0}w]
    - Point: "${peel.point || sec.guidance || "Core assertion"}"
    - Evidence: "${peel.evidence || (sec.linkedEvidenceIds?.length ? `${sec.linkedEvidenceIds.length} linked sources` : "Pending citation")}"
    - Explanation: "${peel.explanation || "Critical analysis & evaluation"}"
    - Link: "${peel.link || "Synthesis back to central thesis"}"
    - Draft Excerpt: "${(sec.draftContent || "").slice(0, 200)}..."`;
}).join("\n\n") || "  (Outline not yet initialized)"}
`;
    systemPrompt = `You are the Scribe, the Academic Drafting & Synthesis Copilot in Scholar OS.
Your role is to assist with sequential section drafting using the rigorous PEEL framework (Point, Evidence, Explanation, Link), favouring critical analysis over description.
Help deepen analytical critique, strengthen argumentative transitions, eliminate passive phrasing, and smoothly bind claims to in-text citations.`;
  } else {
    personaName = "Examiner";
    personaRole = "Quality Audit & Final Review";
    scopedContextSummary = `
PHASE 4 SUBMISSION AUDIT & EXAMINER STATE:
- Overall Score & Grade Band: ${rubricAudit?.overallScore ? `${rubricAudit.overallScore}% (${rubricAudit.bandLabel || rubricAudit.overallBand})` : "Pending final audit"}
- Readiness Index: ${rubricAudit?.readinessPercentage ? `${rubricAudit.readinessPercentage}%`.replace(/%%$/, "%") : "Not measured yet"}
- Priority Fixes Identified:
${(rubricAudit?.priorityFixes || []).map((f, i) => `  [Fix ${i + 1}] ${f}`).join("\n") || "  - None identified yet"}
- Unresolved In-Text Citations (${unresolvedCitations.length}):
${unresolvedCitations.map((c, i) => `  [C${i + 1}] "${typeof c === "string" ? c : c.rawCitation || ""}" (Missing from bibliography or ambiguous)`).join("\n") || "  - None found"}
- Word Count Adherence: ${currentTotalWords.toLocaleString()} / ${targetWordCount.toLocaleString()} words (${Math.abs(currentTotalWords - targetWordCount) <= targetWordCount * 0.1 ? "Compliant within ±10%" : "Check word count margin"})
`;
    systemPrompt = `You are the Examiner, the Quality Audit & Final Review Copilot in Scholar OS.
Your role is to check the draft against the brief's own marking criteria and requirements, reconcile citations with the reference list, and check formatting.
Never predict a mark or grade, and never assume a grading scale the brief does not state. Explain what each criterion asks for, where the draft meets it or falls short (quote the draft), which fixes matter most, and how to resolve citation problems.`;
  }
  return { personaName, personaRole, scopedContextSummary, systemPrompt };
}

/* ------------------- Coursework agent steps (extract, understand, sources, review) ------------------- */
// The domain modules keep the types and the parsers that validate the AI's answers;
// the prompt text lives here, reached through scholarBrain.courseworkPrompts.

const clip = (s: string | undefined, n: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

export function extractPrompt(): string {
  return [
    "You read a student's assignment brief and any materials they added, and record what the assignment asks for.",
    "Quote the brief word for word for every question, requirement and marking criterion (the exact words, at least a few words long). Never add a requirement the brief does not state.",
    "List what is missing that the student must decide or ask their tutor (for example no word count, no referencing style, an unclear question), with why it matters. Do not invent answers to these.",
    "For each added material, say in one sentence what it contains, from its text only.",
    'Respond with ONLY JSON: {"task": "<one sentence: what must be produced>", "questions": [{"text": "...", "quote": "<exact words>"}], "requirements": [{"text": "...", "quote": "<exact words>", "kind": "content|format|length|referencing|submission|other"}], "objectives": ["..."], "constraints": {"wordCount": <number or omit>, "citationStyle": "...", "deadline": "...", "format": "...", "level": "..."}, "criteria": [{"criterion": "...", "weight": <percent or omit>, "quote": "<exact words>"}], "materials": [{"name": "...", "summary": "..."}], "missing": [{"question": "...", "why": "..."}]}',
  ].join("\n");
}

export function extractUserPrompt(i: ExtractInput): string {
  const parts = [`Assignment brief:\n${clip(i.brief, 12000) || "(empty)"}`];
  for (const m of (i.materials ?? []).slice(0, 6)) parts.push(`Material "${clip(m.name, 120)}":\n${clip(m.text, 4000)}`);
  if (i.clarifications?.trim()) parts.push(`The student's clarifications:\n${clip(i.clarifications, 2000)}`);
  return parts.join("\n\n");
}

export function understandPrompt(): string {
  return [
    "You are planning a piece of student coursework before any writing starts. From the brief's extraction, work out what must be produced and how.",
    "Be specific to this assignment: its subject, its question, its marking criteria. Do not state facts, findings or sources; those come from research later.",
    "knowledgeGaps are what the student must find evidence about. searchQueries are 2 to 5 short scholarly search queries (keywords, not sentences) that would find that evidence.",
    "thesisDirection is a provisional line of argument to test, phrased tentatively. blockers are things that must be settled before writing (from the missing information), or empty.",
    'Respond with ONLY JSON: {"discipline": "...", "assignmentType": "...", "produce": "<what the finished piece is>", "approach": "<how to tackle it>", "structure": "<the shape the piece should take>", "criteria": [{"criterion": "...", "howToMeet": "..."}], "knowledgeGaps": ["..."], "searchQueries": ["..."], "thesisDirection": "...", "blockers": ["..."]}',
  ].join("\n");
}

export function understandUserPrompt(e: Extraction, brief: string, extra?: { level?: string; citationStyle?: string; words?: number }): string {
  return [
    `Brief (for reference):\n${clip(brief, 6000)}`,
    `Task: ${e.task}`,
    e.questions.length ? `Questions:\n- ${e.questions.map((q) => q.text).join("\n- ")}` : "",
    e.requirements.length ? `Requirements:\n- ${e.requirements.map((r) => `${r.text} [${r.kind}]`).join("\n- ")}` : "",
    e.criteria.length ? `Marking criteria:\n- ${e.criteria.map((c) => `${c.criterion}${c.weight ? ` (${c.weight}%)` : ""}`).join("\n- ")}` : "No marking criteria were given.",
    e.missing.length ? `Missing information:\n- ${e.missing.map((m) => m.question).join("\n- ")}` : "",
    `Level: ${extra?.level || e.constraints.level || "not stated"}. Length: ${extra?.words || e.constraints.wordCount || "not stated"} words. Referencing: ${extra?.citationStyle || e.constraints.citationStyle || "not stated"}.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function sourcesPrompt(): string {
  return [
    "You assess real search results for a student's coursework. You see each source's title, authors, year, venue and abstract only, not the full text; say nothing beyond what these show.",
    "For each source: relevance to this assignment and its working thesis (high, medium or low: high only when it bears directly on a question the brief sets or on the thesis; a source that only shares a keyword is low); credibility in one short phrase based on the venue, peer review and citations shown; its main point from the abstract; fit: one sentence on what it does for this assignment (supports, challenges or gives context to which point); up to 2 pieces of evidence, each a claim with an exact quote from the abstract; and which outline sections (by id) it supports, only where it bears on that section's purpose.",
    "If a source has no abstract, give no evidence and judge relevance from the title only.",
    'Respond with ONLY JSON: {"sources": [{"id": "...", "relevance": "high|medium|low", "credibility": "...", "mainPoint": "...", "fit": "...", "evidence": [{"claim": "...", "quote": "<exact words from the abstract>"}], "sections": ["<section id>"]}]}',
  ].join("\n");
}

export function sourcesUserPrompt(task: string, sections: Array<{ id: string; title: string; purpose?: string }>, sources: SourceForAnalysis[], thesis?: string): string {
  return [
    `Assignment: ${clip(task, 800)}`,
    thesis ? `Working thesis: ${clip(thesis, 600)}` : "",
    `Outline sections:\n${sections.slice(0, 30).map((s) => `- ${s.id}: ${clip(s.title, 140)}${s.purpose ? ` (purpose: ${clip(s.purpose, 160)})` : ""}`).join("\n") || "(none yet)"}`,
    `Sources:\n${sources
      .slice(0, 20)
      .map(
        (s) =>
          `[${s.id}] ${clip(s.title, 300)} — ${clip((s.authors ?? []).slice(0, 4).join(", "), 160)} (${s.year || "n.d."}). ${clip(s.venue, 160)}${s.peerReviewed ? ", peer-reviewed" : ""}${typeof s.citationCount === "number" ? `, cited ${s.citationCount} times` : ""}\nAbstract: ${clip(s.abstract, 1500) || "(none)"}`
      )
      .join("\n\n")}`,
  ].filter(Boolean).join("\n\n");
}

export function reviewPrompt(): string {
  return [
    "You review a student's draft before submission against their brief. Be specific and fair; do not predict a mark.",
    "For each numbered requirement: met, partly or missing, with an exact quote from the draft that shows it (omit the quote if missing) and what to fix.",
    "unsupportedClaims: sentences stating facts or findings without a citation, quoted exactly. argument: weaknesses in reasoning or evidence use. structure: problems with order, flow or balance. language: grammar, clarity or register problems, each an exact quote and a corrected version.",
    "Every quote must be copied exactly from the draft. Give at most 8 items per list.",
    'Respond with ONLY JSON: {"summary": "<two sentences>", "requirements": [{"index": <number>, "status": "met|partly|missing", "quote": "...", "fix": "..."}], "unsupportedClaims": [{"quote": "...", "why": "..."}], "argument": [{"comment": "...", "quote": "..."}], "structure": [{"comment": "...", "quote": "..."}], "language": [{"quote": "...", "suggestion": "..."}]}',
  ].join("\n");
}

export function reviewUserPrompt(i: ReviewInput): string {
  return [
    i.question ? `Question: ${clip(i.question, 1000)}` : "",
    `Requirements:\n${i.requirements.map((r, n) => `${n + 1}. ${clip(r.text, 300)}`).join("\n") || "(none extracted)"}`,
    i.criteria.length ? `Marking criteria: ${i.criteria.map((c) => `${c.criterion}${c.weight ? ` (${c.weight}%)` : ""}`).join("; ")}` : "",
    `Referencing style: ${i.citationStyle || "not stated"}. Target length: ${i.targetWords || "not stated"} words.`,
    `Draft:\n${clip(i.draft, 30000)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/* -------------------------------------- Outline -------------------------------------- */

export function assignmentOutlinePrompt(): string {
  return [
    "You design the outline (table of contents) of one piece of student coursework from its brief, and propose its working thesis.",
    "Decide the structure this brief needs; do not use a fixed template. A report or case study usually has an introduction, analysis sections and conclusions or recommendations; an essay has an introduction, a line of argument in several sections and a conclusion; a literature review is organised by themes or debates. Follow any structure the brief itself asks for, and give every question the brief sets its own section.",
    "Name headings after what this assignment is about (its organisation, case, theory, question), not generic labels like 'Body' or 'Main points' alone.",
    "Levels: sections are H1; give a section H2 sub-sections when it needs them, and an H2 its own H3 sub-sections only when the argument needs that depth. Each writing unit (an H2 without H3s, an H3, or an undivided section) is about 120 to 700 words.",
    "You decide the word budget of every unit; together they must add up to the target total. Weigh them by what each part must achieve: use the marks the brief gives each question and the marking criteria as a guide (a question worth 40% of the marks usually deserves about 40% of the words), and say in a unit's purpose if you depart from that and why.",
    "For every section and unit give its purpose: one sentence on its academic role (what it must establish for the argument). Where a section builds on an earlier one, list the earlier titles in dependsOn. For a section that answers a question of the brief, set questionRef to that question's label (for example Q2).",
    "Propose three distinct working theses: defensible one-sentence answers to the assignment's central question, each taking a different angle, phrased as claims to test. Put the strongest first.",
    "Do not state findings, figures, sources or quotations that are not in the brief.",
    "When the student asks for a change, apply it to the current outline and keep everything else, especially sections that already have text. If they ask for a new total length, set totalWords to it.",
    'Respond with ONLY JSON: {"totalWords": <number, only if the student asked for a new total>, "thesisOptions": [{"statement": "...", "angle": "<2-4 words>"}], "sections": [{"title": "...", "purpose": "...", "questionRef": "<Q label or omit>", "dependsOn": ["<earlier title>"], "words": <number, only if the section has no sub-sections>, "subsections": [{"title": "...", "words": <number>, "purpose": "...", "guidance": "<one sentence on what it must do>", "dependsOn": [], "subsections": [{"title": "...", "words": <number>, "purpose": "...", "guidance": "..."}]}]}]}',
  ].join("\n");
}

export function assignmentOutlineUserPrompt(c: AssignmentOutlineContext): string {
  const lines = [
    `Brief:\n${clip(c.brief || c.question, 6000) || "(no brief text)"}`,
    c.question && c.question !== c.brief ? `Question or task: ${clip(c.question, 600)}` : "",
    `Form: ${c.assignmentType || "essay"}. Level: ${c.academicLevel || "undergraduate"}. Referencing: ${c.citationStyle || "as the brief says"}.`,
    `Target length: ${c.targetWords} words.`,
    c.criteria?.length ? `Marking criteria from the brief:\n- ${c.criteria.slice(0, 10).map((x) => clip(x, 200)).join("\n- ")}` : "The brief gives no marking criteria.",
    c.questions?.length
      ? `Questions the brief sets (each needs its own section; marks are a guide to the words):\n- ${c.questions.slice(0, 12).map((q) => `${q.key}: ${clip(q.title, 200)}${q.marks ? ` (${q.marks} marks)` : ""}`).join("\n- ")}`
      : "",
    structureLens(c.discipline, c.assignmentType),
    c.plan ? `Plan for this assignment (from reading the brief):\n${clip(c.plan, 2500)}` : "",
  ];
  if (c.current?.headings?.length) {
    lines.push(
      "Current outline:\n" +
        c.current.headings
          .map((h) => `${h.title}\n${h.subheadings.map((s) => `  - ${s.title} (${s.targetWordCount} words${c.written?.includes(s.id) ? ", has text" : ""})`).join("\n")}`)
          .join("\n")
    );
  }
  if (c.instruction) lines.push(`The student asks: ${clip(c.instruction, 600)}`);
  return lines.filter(Boolean).join("\n\n");
}

/* ------------------------------- Thesis refinement ------------------------------- */

/** Sharpen a working thesis the student wrote (or chose), keeping their position. */
export function thesisRefinePrompt(): string {
  return [
    "You help a student sharpen the working thesis of one piece of coursework.",
    "Keep the student's position and claim; do not replace it with a different argument. Make it a single, specific, arguable sentence that answers the assignment's central question, names its scope, and can be tested with evidence.",
    "If the student asks for a particular change, make that change.",
    "Do not add findings, figures, sources or quotations that are not in the brief or the thesis.",
    'Respond with ONLY JSON: {"thesis": "<the refined thesis, one sentence>", "note": "<one short sentence on what you changed and why>"}',
  ].join("\n");
}

export function thesisRefineUserPrompt(i: { brief: string; thesis: string; instruction?: string; level?: string }): string {
  return [
    `Brief:\n${clip(i.brief, 4000)}`,
    i.level ? `Level: ${clip(i.level, 60)}.` : "",
    `Student's working thesis:\n${clip(i.thesis, 1200)}`,
    i.instruction ? `The student asks: ${clip(i.instruction, 400)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/* ------------------------------- One outline section ------------------------------- */

/** Rewrite one section of the outline; the rest of the outline and the section's budget stay. */
export function outlineSectionPrompt(): string {
  return [
    "You rewrite ONE section of a student's coursework outline. The rest of the outline stays as it is.",
    "Keep the section's role in the outline unless the student asks otherwise; improve its heading, its H2 (and, only where the argument needs it, H3) sub-sections, their purposes and their share of the section's words. Name headings after what the assignment is about, not generic labels.",
    "The section's word budget is fixed: the sub-section words must add up to it.",
    "Do not state findings, figures, sources or quotations that are not in the brief.",
    'Respond with ONLY JSON: {"section": {"title": "...", "purpose": "...", "questionRef": "<Q label or omit>", "dependsOn": [], "subsections": [{"title": "...", "words": <number>, "purpose": "...", "guidance": "...", "subsections": [{"title": "...", "words": <number>, "purpose": "...", "guidance": "..."}]}]}}',
  ].join("\n");
}

export function outlineSectionUserPrompt(i: {
  brief: string;
  thesis?: string;
  outline: Array<{ title: string; words: number; isTarget: boolean }>;
  target: { title: string; purpose?: string; words: number; units: Array<{ title: string; words: number }> };
  instruction?: string;
}): string {
  return [
    `Brief:\n${clip(i.brief, 4000)}`,
    i.thesis ? `Working thesis: ${clip(i.thesis, 600)}` : "",
    `The whole outline (the section to rewrite is marked):\n${i.outline.map((h, k) => `${k + 1}. ${clip(h.title, 160)} (${h.words} words)${h.isTarget ? "  <- rewrite this one" : ""}`).join("\n")}`,
    `Section to rewrite: "${clip(i.target.title, 160)}", ${i.target.words} words in total.${i.target.purpose ? ` Its purpose: ${clip(i.target.purpose, 300)}` : ""}\nIts current sub-sections:\n${i.target.units.map((u) => `- ${clip(u.title, 160)} (${u.words} words)`).join("\n") || "- (none)"}`,
    i.instruction ? `The student asks: ${clip(i.instruction, 600)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/* ------------------------------- Evidence from an upload ------------------------------- */

/** Read a student's uploaded material for evidence: exact quotes only, nothing invented. */
export function evidencePrompt(): string {
  return [
    "You read a document a student uploaded for their coursework (lecture slides, notes, a reading or data) and pick out the passages that bear on their assignment question.",
    "Quote the document exactly: every excerpt must be copied word for word from the passages given. Never paraphrase inside an excerpt, never invent a quotation, a page or slide number, an author or a year.",
    "Give an author or year only when the passages state it; otherwise omit the field.",
    'Respond with ONLY JSON: {"title": "<clean title of the material, or omit>", "author": "<only if stated>", "year": "<four digits, only if stated>", "mainFinding": "<one or two sentences: what this material says that matters for the question>", "excerpts": [{"excerpt": "<exact words>", "context": "<why it matters for the question>", "sourceLocation": "<the location label of the passage it came from>", "claim": "<the point in the assignment it supports>"}]}',
  ].join("\n");
}

export function evidenceUserPrompt(i: EvidenceInput): string {
  const passages = i.passages.map((p) => `[Location: ${clip(p.location, 80)}]\n${p.text}`).join("\n\n---\n\n");
  return `Assignment question: ${clip(i.question, 1500)}\nMaterial: "${clip(i.title, 200)}" (${clip(i.sourceType, 40)})\n\nPassages:\n${passages}`;
}

