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

/**
 * The drafting loop every workspace shares: one draft, then, when it is short
 * of `minWords`, one lengthening step, with the model's tokens streamed as
 * they arrive. Each workspace configures it:
 *   - `lengthen.mode: "expand"` (Journal): a full rewrite, kept only when longer;
 *   - `lengthen.mode: "continue"` (Coursework): new paragraphs appended after
 *     the draft, shown as they arrive, dropped when `accept` rejects them (a
 *     continuation that restates the draft);
 *   - `startFrom` (resume): the draft so far; the loop only continues it.
 * A step that fails keeps the real text already written; nothing is invented.
 * A cancelled call (`signal`) ends the loop. Prompts, citation handling and
 * the voice pass stay with the workspace.
 */
export interface SectionDraftLoop {
  systemPrompt: string;
  userPrompt: string;
  minWords: number;
  lengthen?: {
    mode: "expand" | "continue";
    prompt: (draft: string, draftWords: number) => string;
    accept?: (more: string, draft: string) => boolean;
  };
  startFrom?: string;
  stream?: {
    onToken: (text: string) => void;
    /** Show this text instead of what was shown (a continuation starts, or a model switch dropped output). */
    onReplace: (text: string) => void;
  };
  signal?: AbortSignal;
  countWords?: (text: string) => number;
}

export interface SectionDraftLoopResult {
  text: string;
  calls: Array<Pick<Awaited<ReturnType<Completer>>, "provider" | "model" | "inputTokensEstimate" | "outputTokensEstimate">>;
}

export async function runSectionDraft(complete: Completer, loop: SectionDraftLoop): Promise<SectionDraftLoopResult> {
  const count = loop.countWords ?? countExactWords;
  const calls: SectionDraftLoopResult["calls"] = [];
  const call = async (userPrompt: string, shownBefore: string) => {
    const r = await complete({
      taskClass: "drafting",
      systemPrompt: loop.systemPrompt,
      userPrompt,
      signal: loop.signal,
      ...(loop.stream ? { onToken: loop.stream.onToken, onReset: () => loop.stream?.onReplace(shownBefore) } : {}),
    });
    calls.push(r);
    return r.text.trim();
  };

  // Resume: continue the draft so far; nothing else.
  if (loop.startFrom) {
    if (!loop.lengthen) throw new Error("runSectionDraft: startFrom needs a lengthen prompt.");
    const prefix = `${loop.startFrom}\n\n`;
    loop.stream?.onReplace(prefix);
    const more = await call(loop.lengthen.prompt(loop.startFrom, count(loop.startFrom)), prefix);
    if (!more) throw new UnusableAiResponseError("section draft");
    return { text: `${loop.startFrom}\n\n${more}`, calls };
  }

  // 1. The draft. No usable text means no section: nothing is invented in its place.
  let draft = await call(loop.userPrompt, "");
  if (!draft) throw new UnusableAiResponseError("section draft");

  // 2. One lengthening step when short; a failure keeps the real draft.
  const words = count(draft);
  if (loop.lengthen && words < loop.minWords) {
    const { mode, prompt, accept } = loop.lengthen;
    const prefix = mode === "continue" ? `${draft}\n\n` : "";
    loop.stream?.onReplace(prefix);
    let adopted = false;
    try {
      const more = await call(prompt(draft, words), prefix);
      if (mode === "continue" && more && (accept ? accept(more, draft) : true)) {
        draft = `${draft}\n\n${more}`;
        adopted = true;
      } else if (mode === "expand" && more && count(more) > words) {
        draft = more;
        adopted = true;
      }
    } catch (e) {
      if (loop.signal?.aborted) throw e;
      console.warn(
        isInterrupt(e) ? "[sectionDrafter] lengthening needs another AI step; keeping the first draft" : "[sectionDrafter] lengthening failed; keeping the shorter draft",
        e instanceof Error ? e.message : ""
      );
    }
    // The step was not kept: show the draft as it stands again.
    if (!adopted) loop.stream?.onReplace(draft);
  }
  return { text: draft, calls };
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

  // 1-2. The draft, and one expansion when it is more than 8% short (kept only when longer).
  const loop = await runSectionDraft(complete, {
    systemPrompt,
    userPrompt,
    minWords: input.targetWords * 0.92,
    lengthen: {
      mode: "expand",
      prompt: (draft, draftWords) =>
        journalPrompts.sectionExpansionPrompt({
          sectionTitle: input.title,
          draft,
          draftWords,
          targetWords: input.targetWords,
          citationIds: input.sources.map((s) => s.id),
        }),
    },
  });
  const draft = loop.text;
  const first = loop.calls[0];
  const inputTokens = loop.calls.reduce((n, c) => n + c.inputTokensEstimate, 0);
  const outputTokens = loop.calls.reduce((n, c) => n + c.outputTokensEstimate, 0);

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
