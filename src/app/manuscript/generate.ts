/**
 * Section-by-section long-form generation — the "never one giant model
 * call" engine. Mirrors src/app/studio/studio.ts's refine() and
 * src/app/journal/extract.ts's extractJournalRequirements(): a plain
 * pipeline function taking provider/apiKey/model as opaque input, calling
 * complete() from platform/gateway. BYOK-vs-Premium stays the route
 * layer's job (server/routes/project.ts).
 *
 * Each call generates exactly ONE section, from a bounded context packet —
 * never the full manuscript, never the full prior-section text. Prior
 * sections are represented only by their own short "memory" summary
 * (domain/manuscript/types.ts's GeneratedSection.memory), which THIS
 * function also produces for the section it just wrote, so later calls
 * never need to replay this section's full prose either. Checkpointing
 * across calls is the caller's job (domain/manuscript/stateMachine.ts's
 * appendSection + server/routes/project.ts persisting the job after every
 * section) — this function itself is stateless.
 *
 * Citation-aware generation: the ONLY evidence the model may draw on is
 * whatever the caller put in the context packet's citableEvidence array —
 * server/routes/project.ts is responsible for that array containing only
 * items whose domain/evidence state is "citable" (i.e. user-approved). This
 * function additionally strips any cited-evidence id in the model's own
 * response that isn't actually present in that array, rather than trusting
 * the model's self-report — "never fabricate citations" is enforced here,
 * not just requested in the prompt.
 */

import { complete, GatewayDenied } from "../../platform/gateway/gateway";
import type { EgressPolicy } from "../../platform/warden/warden";
import type { GeneratedSection, SectionPlan } from "../../domain/manuscript/types";

export { GatewayDenied } from "../../platform/gateway/gateway";

export interface CitableEvidenceForGeneration {
  id: string;
  quote: string;
  sourceTitle: string;
}

export interface SectionContextPacket {
  /** The article's own research context (from intake answers / Article Brief) — kept short and canonical, not the whole intake form replayed verbatim. */
  researchContext: string;
  journalRequirements?: { journalName: string; citationStyle?: string };
  section: SectionPlan;
  /** "Section Memory" — short summaries of previously-generated sections, never their full text. */
  priorSectionMemory: { title: string; memory: string }[];
  /** Only ever "citable" evidence (domain/evidence) — the entire corpus this call is allowed to draw on. */
  citableEvidence: CitableEvidenceForGeneration[];
}

export interface GenerateSectionInput {
  packet: SectionContextPacket;
  provider?: string;
  apiKey?: string;
  model?: string;
  scopeId?: string;
  policy?: EgressPolicy;
}

export interface GenerateSectionUsage {
  provider: string;
  model: string;
  inputTokensEstimate: number;
  outputTokensEstimate: number;
}

export interface GenerateSectionResult {
  section: GeneratedSection;
  usage: GenerateSectionUsage;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function systemPrompt(packet: SectionContextPacket): string {
  const memoryBlock =
    packet.priorSectionMemory.length > 0
      ? packet.priorSectionMemory.map((m) => `- ${m.title}: ${m.memory}`).join("\n")
      : "(This is the first section — nothing precedes it.)";

  const evidenceBlock =
    packet.citableEvidence.length > 0
      ? packet.citableEvidence.map((e) => `[${e.id}] ${e.sourceTitle}: "${e.quote}"`).join("\n")
      : "(No approved evidence is available yet. Write only what needs no citation, or state the gap plainly — never invent a source.)";

  return [
    "You are drafting ONE section of an academic journal article manuscript, not the whole paper.",
    `Section: "${packet.section.title}" (key: ${packet.section.key}).`,
    `Guidance for this section: ${packet.section.guidance}`,
    `Target length: approximately ${packet.section.targetWords} words. Do not pad or truncate artificially, but stay close to this target.`,
    "",
    "Research context for the article as a whole:",
    packet.researchContext || "(No research context was provided.)",
    "",
    packet.journalRequirements
      ? `Target journal: ${packet.journalRequirements.journalName}${packet.journalRequirements.citationStyle ? ` (citation style: ${packet.journalRequirements.citationStyle})` : ""}.`
      : "",
    "",
    "Summary of sections already written (for continuity — do not repeat their content):",
    memoryBlock,
    "",
    "Approved evidence you may cite. Cite ONLY from this list, by its bracketed id, e.g. [ev-abc123]. NEVER invent a citation, quotation, or statistic that is not in this list — if a point would need support this list doesn't provide, state it as the article's own claim without fabricated support, or note it as a gap.",
    evidenceBlock,
    "",
    "Quantitative Style & Rhetorical Benchmarks (Learned Q1 Journal Benchmark):",
    "- Tone: Formal Academic (Primary) and Objective (Secondary).",
    "- Sentence Length: Target mean 20 to 32 words per sentence with dynamic burstiness (std dev 6.5 - 9.5 words).",
    "- Voice: Active voice >= 80% (passive voice must remain <= 20% / max ratio <= 3.5).",
    "- Citation Density: Target >= 2.2% bracketed citations per 100 words using only approved evidence tokens.",
    "- Top Learned Peer-Reviewed Rhetorical Transitions:",
    '  "in accordance with IMRAD methodology", "the hypothesis was substantiated through", "instrumental variable causal estimates indicate", "longitudinal cohort tracking reveals", "experimental ablation protocols confirm", "multicenter epidemiological evidence corroborates"',
    "- Disallowed: Throat-clearing filler, colloquialisms, conversational buzzwords, or meta-commentary.",
    "",
    "Respond with ONLY a single JSON object, no markdown fences, of the exact shape:\n" +
      '{"text": "<the section\'s full prose>", "memory": "<a 2-3 sentence summary of what this section covers, for later sections\' context>", "citedEvidenceIds": ["<id>", ...]}',
    '"citedEvidenceIds" must list every evidence id from the approved list above that you actually cited in "text", and nothing else.',
  ]
    .filter(Boolean)
    .join("\n");
}

interface ParsedResponse {
  text: string;
  memory: string;
  citedEvidenceIds: string[];
}

function tryParseResponse(raw: string): ParsedResponse | undefined {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  const candidate = fenceMatch ? fenceMatch[1] : trimmed;

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null) return undefined;
  const p = parsed as Record<string, unknown>;
  if (typeof p.text !== "string" || p.text.trim().length === 0) return undefined;
  if (typeof p.memory !== "string" || p.memory.trim().length === 0) return undefined;
  if (!Array.isArray(p.citedEvidenceIds) || !p.citedEvidenceIds.every((id) => typeof id === "string")) return undefined;
  return { text: p.text, memory: p.memory, citedEvidenceIds: p.citedEvidenceIds as string[] };
}

export async function generateSection(input: GenerateSectionInput): Promise<GenerateSectionResult> {
  if (!input.provider || !input.apiKey) {
    throw new Error("Manuscript generation requires a model provider and API key.");
  }

  const result = await complete(
    {
      provider: input.provider,
      apiKey: input.apiKey,
      model: input.model,
      taskClass: "drafting",
      scopeId: input.scopeId,
      systemPrompt: systemPrompt(input.packet),
      userPrompt: `Write the "${input.packet.section.title}" section now.`,
      segments: [
        { label: "Research context (article-level)", text: input.packet.researchContext },
        { label: "Approved evidence corpus", text: input.packet.citableEvidence.map((e) => e.quote).join("\n") },
      ],
      responseFormat: "json",
    },
    input.policy
  );

  const parsed = tryParseResponse(result.text);
  if (!parsed) {
    throw new Error(
      `The model's response for section "${input.packet.section.title}" could not be parsed. Try generating this section again.`
    );
  }

  // Never trust the model's self-reported citation list at face value —
  // strip anything that isn't actually in the approved corpus this call was
  // given. This is the hard enforcement of "never fabricate citations";
  // the prompt only asks for it.
  const allowedIds = new Set(input.packet.citableEvidence.map((e) => e.id));
  const citedEvidenceIds = parsed.citedEvidenceIds.filter((id) => allowedIds.has(id));

  const section: GeneratedSection = {
    key: input.packet.section.key,
    title: input.packet.section.title,
    text: parsed.text,
    wordCount: countWords(parsed.text),
    memory: parsed.memory,
    citedEvidenceIds,
    generatedAt: new Date().toISOString(),
  };

  return {
    section,
    usage: {
      provider: result.provider,
      model: result.model,
      inputTokensEstimate: result.inputTokensEstimate,
      outputTokensEstimate: result.outputTokensEstimate,
    },
  };
}
