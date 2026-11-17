/**
 * The one section drafter. Every manuscript section the AI writes goes
 * through `draftSection`, reached as `scholarBrain.draftSection`:
 *
 *   - the Journal Writing Studio (`POST /agentic/draft-subsection`), one
 *     section when the author asks;
 *   - the desk's manuscript generation job (`POST /manuscript/next-section`),
 *     the next planned section of the job.
 *
 * One section per call, from a bounded context: what the article is about,
 * what this section has to do, excerpts of sections already written, and the
 * only sources it may cite. The steps are always the same:
 *
 *   1. draft (prompts: `prompts/journalPrompts.ts`);
 *   2. if the draft is more than 8% short, one expansion (kept only when it is
 *      longer; never padded with filler);
 *   3. citations outside the source list are removed; verified ones stay as
 *      `[CITE:id]` tokens, formatted later in the project's own style;
 *   4. the scholarly voice pass (dialect spelling, AI clichés), with citation
 *      tokens masked so an id is never respelled.
 *
 * Nothing is saved here; the caller decides where the text goes.
 */
import type { Completer } from "../../../src/platform/completion.ts";
import { CompletionInterrupted } from "../../../src/platform/completion.ts";
import * as journalPrompts from "./prompts/journalPrompts.ts";
import { chunkAndRerankEvidence } from "./semanticRagEngine.ts";
import { formatCitationLedger, scrubCitations, type ChronologicalWarning, type VerifiedSourceItem } from "../utils/citationLockScrubber.ts";
import { buildScholarlyVoiceSystemPrompt, evaluateBurstiness, sanitizeScholarlyText, type ScholarlyDialect } from "../utils/scholarlyVoiceGuard.ts";
import { countExactWords } from "../utils/wordBudgetAllocator.ts";
import { withCitationTokensMasked } from "../utils/citationLock.ts";
import { BrowserAiRequiredError, NoClientAiProviderError, UnusableAiResponseError } from "../ai/aiRouteErrors.ts";

export interface DraftSectionInput {
  /** The section's title as the model should see it ("Introduction: Research Questions"). */
  title: string;
  targetWords: number;
  dialect: ScholarlyDialect;
  /** What the article is about (see researchContextFromAnswers). */
  researchContext: string;
  journal?: { name: string; citationStyle?: string };
  /** What this kind of section has to do. */
  sectionBrief?: string;
  /** What the author typed for this draft. */
  authorGuidance?: string;
  /** Excerpts of sections already written (see priorSectionsContext). */
  writtenSections?: string;
  /** The only sources the draft may cite. */
  sources: VerifiedSourceItem[];
}

export interface DraftSectionResult {
  /** The section's prose, citations as [CITE:id] tokens. */
  text: string;
  wordCount: number;
  /** Ids of the sources the text actually cites. */
  citedIds: string[];
  /** Citations the model wrote that are not in the source list (removed). */
  strippedCitations: string[];
  resolvedCitationsCount: number;
  unverifiedClaimsCount: number;
  chronologicalWarnings: ChronologicalWarning[];
  burstinessMetrics: ReturnType<typeof evaluateBurstiness>;
  /** A short excerpt of this section, for drafting later sections without replaying it. */
  memory: string;
  usage: { provider: string; model: string; inputTokensEstimate: number; outputTokensEstimate: number };
}

const isInterrupt = (e: unknown) =>
  e instanceof CompletionInterrupted || e instanceof BrowserAiRequiredError || e instanceof NoClientAiProviderError;

/** A short excerpt of a section (its opening sentences, citation tokens removed). */
export function sectionMemory(text: string, maxChars = 400): string {
  const plain = text.replace(/\s*\[(?:CITE|FIG|TAB):[^\]]+\]/g, "").replace(/\s+/g, " ").trim();
  if (plain.length <= maxChars) return plain;
  const sentences = plain.split(/(?<=[.?!])\s+/);
  let out = "";
  for (const s of sentences) {
    if ((out + " " + s).trim().length > maxChars) break;
    out = (out + " " + s).trim();
  }
  return out || `${plain.slice(0, maxChars).trimEnd()} …`;
}

/** Excerpts of sections already written, in order, within a character budget. */
export function priorSectionsContext(sections: Array<{ title: string; text: string }>, maxChars = 6000): string {
  const parts: string[] = [];
  let used = 0;
  for (const s of sections) {
    const body = s.text.trim();
    if (!body) continue;
    const room = maxChars - used;
    if (room < 200) break;
    const cap = Math.min(1500, room);
    const excerpt = body.length > cap ? `${body.slice(0, cap).trimEnd()} …` : body;
    parts.push(`[${s.title}]\n${excerpt}`);
    used += excerpt.length;
  }
  return parts.join("\n\n");
}

/** Answers that say what the article is about, most useful first. */
const CONTEXT_KEYS: Array<[string, string]> = [
  ["working_title", "Working title"],
  ["title", "Title"],
  ["core_problem", "Research problem"],
  ["research_question", "Research question"],
  ["research_questions", "Research questions"],
  ["objectives", "Objectives"],
  ["hypothesis", "Hypothesis"],
  ["gap_selected", "Gap addressed"],
  ["methodology", "Methodology"],
  ["field", "Field"],
  ["discipline", "Discipline"],
  ["target_audience", "Audience"],
];

/**
 * The research context from the project's answers: the known fields first,
 * then other short plain answers, within a budget. Never the whole answer
 * set (saved drafts, JSON blobs and settings stay out of the prompt).
 */
export function researchContextFromAnswers(answers: Record<string, unknown> | undefined, maxChars = 3000): string {
  const a = answers ?? {};
  const lines: string[] = [];
  const used = new Set<string>();
  const plain = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const usable = (v: string) => v && v !== "provisional" && !/^[[{]/.test(v);
  for (const [key, label] of CONTEXT_KEYS) {
    const v = plain(a[key]);
    if (!usable(v)) continue;
    if (key === "title" && used.has("working_title")) continue;
    lines.push(`- ${label}: ${v.slice(0, 600)}`);
    used.add(key);
  }
  for (const [key, raw] of Object.entries(a)) {
    if (used.has(key)) continue;
    const v = plain(raw);
    if (!usable(v) || v.length > 300 || /manuscript|draft|markdown|sections|_at$|^current_|_status$|_completed$|telemetry|token|key$/i.test(key)) continue;
    lines.push(`- ${key.replace(/_/g, " ")}: ${v}`);
  }
  let out = "";
  for (const l of lines) {
    if (out.length + l.length + 1 > maxChars) break;
    out += (out ? "\n" : "") + l;
  }
  return out;
}

export async function draftSection(complete: Completer, input: DraftSectionInput): Promise<DraftSectionResult> {
  const { ledgerPrompt, sourceMap } = formatCitationLedger(input.sources);
  const rag = chunkAndRerankEvidence(input.title, input.sources, 2500);
  const systemPrompt = journalPrompts.sectionDraftSystemPrompt({
    voicePrompt: buildScholarlyVoiceSystemPrompt({ dialect: input.dialect }),
    ledgerPrompt,
    evidenceContext: rag.formattedContext,
    sectionTitle: input.title,
    targetWords: input.targetWords,
  });
  const userPrompt = journalPrompts.sectionDraftUserPrompt({
    sectionTitle: input.title,
    researchContext: input.researchContext,
    journal: input.journal,
    sectionBrief: input.sectionBrief,
    authorGuidance: input.authorGuidance,
    writtenSections: input.writtenSections,
    targetWords: input.targetWords,
  });

  // 1. The draft. No usable text means no section: nothing is invented in its place.
  const first = await complete({ taskClass: "drafting", systemPrompt, userPrompt });
  let draft = first.text.trim();
  if (!draft) throw new UnusableAiResponseError("section draft");
  let outputTokens = first.outputTokensEstimate;
  let inputTokens = first.inputTokensEstimate;

  // 2. One expansion when the draft is more than 8% short; the shorter real draft is kept if it fails.
  const words1 = countExactWords(draft);
  if (words1 < input.targetWords * 0.92) {
    try {
      const expanded = await complete({
        taskClass: "drafting",
        systemPrompt,
        userPrompt: journalPrompts.sectionExpansionPrompt({
          sectionTitle: input.title,
          draft,
          draftWords: words1,
          targetWords: input.targetWords,
          citationIds: input.sources.map((s) => s.id),
        }),
      });
      if (countExactWords(expanded.text) > words1) draft = expanded.text.trim();
      outputTokens += expanded.outputTokensEstimate;
      inputTokens += expanded.inputTokensEstimate;
    } catch (e) {
      if (isInterrupt(e)) {
        // The first draft is real; keep it rather than handing the whole call to the browser again.
        console.warn("[sectionDrafter] expansion needs another AI step; keeping the first draft");
      } else {
        console.warn("[sectionDrafter] expansion failed; keeping the shorter draft", e instanceof Error ? e.message : e);
      }
    }
  }

  // 3-4. Citations checked against the source list, then the voice pass.
  const scrub = scrubCitations(draft, sourceMap, { dialect: input.dialect, keepTokens: true });
  const text = withCitationTokensMasked(scrub.scrubbedText, (t) => sanitizeScholarlyText(t, { dialect: input.dialect, stripCliches: true }));
  const allowed = new Set(input.sources.map((s) => s.id));
  const citedIds = Array.from(new Set(Array.from(text.matchAll(/\[CITE:([^\]]+)\]/g), (m) => m[1]))).filter((id) => allowed.has(id));

  return {
    text,
    wordCount: countExactWords(text),
    citedIds,
    strippedCitations: scrub.strippedCitations,
    resolvedCitationsCount: scrub.resolvedCitationsCount,
    unverifiedClaimsCount: scrub.unverifiedClaimsCount,
    chronologicalWarnings: scrub.chronologicalWarnings,
    burstinessMetrics: evaluateBurstiness(text),
    memory: sectionMemory(text),
    usage: { provider: first.provider, model: first.model, inputTokensEstimate: inputTokens, outputTokensEstimate: outputTokens },
  };
}
