import { Router, Request, Response } from "express";
import { z } from "zod";
import { stripCourseCodes } from "../../../src/utils/briefExtractor.ts";
import {
  VISUAL_TYPES,
  buildOutlineFromBrief,
  cleanBriefText,
  deriveDocumentTitle,
  fitOutline,
  isBannerLine,
  newOutlineId,
  suggestVisualType,
  type OutlineCard,
  type VisualType,
} from "../../../src/shared/presentationBrief.ts";
import { asyncRoute, loadOwnedProject, getSharedStore } from "../project.ts";
import { requestKeyring } from "../../src/ai/routerBridge.ts";
import {
  sanitizeScholarlyText,
  normalizeUnicodeNFC,
} from "../../src/utils/scholarlyVoiceGuard.ts";
import { scholarBrain } from "../../src/services/scholarBrain.ts";
import {
  BrowserAiRequiredError,
  InvalidLlmChallengeError,
  sendAiFailure,
  UnusableAiResponseError,
} from "../../src/ai/aiRouteErrors.ts";
import {
  memoryDecks,
  setMemoryDeck,
  getDecksTable,
  PresentationDeckRow,
} from "../presentations.ts";
import { parseGammaCard, GAMMA_LAYOUT_IDS, type GammaCardPayload } from "./presentationCards.ts";

const router = Router({ mergeParams: true });

export interface SlidePresentationItem {
  slideNumber: number;
  type:
    | "title"
    | "problem_gap"
    | "framework_methodology"
    | "empirical_findings"
    | "discussion_implications"
    | "references";
  title: string;
  subtitle: string;
  visualFocus: string;
  keyPoints: string[];
  speakerNotes: string;
  targetDurationSeconds: number;
  layoutType?: "bullets" | "image-split" | "metric-focus" | "two-column" | "quote-evidence";
  metricValue?: string;
  metricLabel?: string;
  /** Gamma-style card content (layout + structured fields) rendered by the studio. */
  card?: GammaCardPayload;
}

export interface AudienceQuestion {
  questionId: string;
  audienceType: string;
  difficultyLevel: "moderate" | "rigorous" | "adversarial";
  targetedSlideNumber?: number;
  targetedTopic: string;
  questionText: string;
  probingIntent: string;
  suggestedAnswer: string;
  modelRebuttalStructure: string[];
}

export interface GenerateDeckResponse {
  success: boolean;
  deckTitle: string;
  totalSlides: number;
  estimatedDurationMinutes: number;
  slides: SlidePresentationItem[];
  narrativeFramework: string;
  targetAudience: string;
  generatedBy: "ai-gateway" | "heuristic-fallback";
  deck?: Record<string, unknown>;
}

export interface QASimulateResponse {
  success: boolean;
  projectTitle: string;
  qaScenarios: AudienceQuestion[];
  generatedBy: "ai-gateway" | "heuristic-fallback";
}

/**
 * Deterministic heuristic slide deck generator grounded in project state.
 */
function generateProjectDerivedFallbackDeck(
  projectTitle: string,
  durationMinutes: number,
  targetAudience: string,
  researchQuestions: string[],
  methodologyText: string,
  empiricalNotes: string,
  sourcesSummary: string[]
): SlidePresentationItem[] {
  // Uses only what the project actually contains. Where a field is empty the
  // card says what to add instead of inventing findings or references.
  const safeTitle = normalizeUnicodeNFC(projectTitle || "Untitled presentation");
  const slideDuration = Math.max(60, Math.round((durationMinutes * 60) / 6));
  const rq = researchQuestions.filter((q) => q && q.trim());
  const sentences = (t: string) =>
    t
      .split(/(?<=[.!?])\s+/)
      .map((x) => x.trim())
      .filter(Boolean);
  const methodSteps = methodologyText ? sentences(methodologyText).slice(0, 4) : [];
  const findings = empiricalNotes ? sentences(empiricalNotes).slice(0, 4) : [];

  return [
    {
      slideNumber: 1,
      type: "title",
      title: safeTitle,
      subtitle: `${targetAudience} · ${durationMinutes} minutes`,
      visualFocus: "Title card",
      keyPoints: [],
      speakerNotes: `Introduce yourself and the question behind ${safeTitle}. Tell the audience what they will be able to judge by the end.`,
      targetDurationSeconds: Math.min(90, slideDuration),
      layoutType: "bullets",
      card: { layout: "title", eyebrow: targetAudience, lede: rq[0] || undefined, items: [], stats: [] },
    },
    {
      slideNumber: 2,
      type: "problem_gap",
      title: rq.length ? "The question this work answers" : "What is at stake",
      subtitle: rq[0] || "State the gap in one sentence",
      visualFocus: "Statement card",
      keyPoints: rq.slice(0, 4),
      speakerNotes: rq.length
        ? `Frame the problem through the research question: ${rq.join(" ")}`
        : "Explain the gap in current knowledge and who is affected by it. Add your research question to the project to fill this card.",
      targetDurationSeconds: slideDuration,
      layoutType: "bullets",
      card: rq.length > 1
        ? { layout: "list", eyebrow: "Research questions", items: rq.slice(0, 4).map((q) => ({ title: q })), stats: [] }
        : { layout: "statement", eyebrow: "The gap", lede: rq[0] ? undefined : "Add your research question to the project to fill this card.", items: [], stats: [] },
    },
    {
      slideNumber: 3,
      type: "framework_methodology",
      title: "How the study was done",
      subtitle: methodSteps[0] || "Describe your design, data and analysis",
      visualFocus: "Timeline of the method",
      keyPoints: methodSteps.length ? methodSteps : ["Design", "Data", "Analysis"],
      speakerNotes: methodologyText || "Walk through the design, the data you collected and how you analysed it.",
      targetDurationSeconds: slideDuration,
      layoutType: "image-split",
      card: {
        layout: "timeline",
        eyebrow: "Method",
        items: methodSteps.length
          ? methodSteps.map((m) => ({ title: m }))
          : [
              { title: "Design", body: "The type of study and why it fits the question." },
              { title: "Data", body: "What was collected, from whom, and when." },
              { title: "Analysis", body: "How the data were analysed." },
            ],
        stats: [],
      },
    },
    {
      slideNumber: 4,
      type: "empirical_findings",
      title: "What the evidence shows",
      subtitle: findings[0] || "Add your key findings",
      visualFocus: "Findings",
      keyPoints: findings.length ? findings : ["Add your strongest finding", "Add a supporting finding"],
      speakerNotes: empiricalNotes || "Present the findings you can cite. Say the source as you give each number.",
      targetDurationSeconds: slideDuration,
      layoutType: "bullets",
      card: {
        layout: findings.length >= 3 ? "bento" : "list",
        eyebrow: "Findings",
        items: findings.length
          ? findings.map((f) => ({ title: f }))
          : [
              { title: "Strongest finding", body: "Add it from your results or a cited source." },
              { title: "Supporting finding", body: "What else points the same way?" },
            ],
        stats: [],
      },
    },
    {
      slideNumber: 5,
      type: "discussion_implications",
      title: "What this means",
      subtitle: "Contribution, limits and next steps",
      visualFocus: "Implications",
      keyPoints: ["Contribution", "Limitations", "Next steps"],
      speakerNotes: "Say what your work adds, where it stops, and what should be studied next.",
      targetDurationSeconds: slideDuration,
      layoutType: "bullets",
      card: {
        layout: "list",
        eyebrow: "Implications",
        items: [
          { title: "Contribution", body: "What this adds to what was known." },
          { title: "Limitations", body: "Where the findings may not hold." },
          { title: "Next steps", body: "The most useful follow-up study or action." },
        ],
        stats: [],
      },
    },
    {
      slideNumber: 6,
      type: "references",
      title: "Sources",
      subtitle: sourcesSummary.length ? "From your Knowledge Vault" : "Add sources to your Knowledge Vault",
      visualFocus: "Reference list",
      keyPoints: sourcesSummary.slice(0, 4),
      speakerNotes: sourcesSummary.length
        ? "These are the sources cited in this talk. Thank the audience and invite questions."
        : "No sources are attached to this project yet. Add them to the Knowledge Vault before presenting.",
      targetDurationSeconds: Math.min(90, slideDuration),
      layoutType: "bullets",
      card: {
        layout: sourcesSummary.length ? "list" : "statement",
        eyebrow: "References",
        lede: sourcesSummary.length ? undefined : "No sources are attached to this project yet.",
        items: sourcesSummary.slice(0, 6).map((src) => ({ title: src })),
        stats: [],
      },
    },
  ];
}



function buildSlideDeckFromItems(
  deckId: string,
  title: string,
  slides: SlidePresentationItem[]
): Record<string, unknown> {
  const cards = slides.map((s, idx) => ({
    id: `slide-${deckId}-${idx + 1}`,
    order: idx + 1,
    actionHeadline: s.title,
    summary: s.subtitle,
    speakerNotes: s.speakerNotes,
    framework: "Standard-Narrative",
    frameworkPhase: s.type,
    layoutType: s.card?.layout || s.layoutType || "bullets",
    targetDurationSeconds: s.targetDurationSeconds,
    content: s.card
      ? {
          eyebrow: s.card.eyebrow,
          headline: s.title,
          lede: s.card.lede,
          items: s.card.items,
          stats: s.card.stats,
          columns: s.card.columns,
          quote: s.card.quote,
          takeaway: s.card.takeaway,
        }
      : undefined,
    blocks: [
      {
        type: "action-header",
        headline: s.title,
        category: s.type.toUpperCase().replace(/_/g, " "),
        subheadline: s.subtitle,
      },
      s.metricValue
        ? {
            type: "metric-callout",
            metric: s.metricValue,
            value: s.metricValue,
            label: s.metricLabel || "Key Metric",
            context: s.keyPoints[0] || "",
          }
        : {
            type: "bullet-list",
            items: s.keyPoints.slice(0, 6),
          },
    ],
  }));

  return {
    id: deckId,
    title,
    topic: title,
    framework: "Standard-Narrative",
    themeId: "scholar-paper",
    slides: cards,
    activeSlideIndex: 0,
    sourceModule: "presentation-studio",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

const outlineSchema = z.object({
  title: z.string().trim().max(200).nullish(),
  slides: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(160),
        visualType: z.string().trim().max(40).nullish(),
        bullets: z.array(z.string().trim().max(200)).max(8).nullish(),
      })
    )
    .min(1)
    .max(30),
});

/**
 * POST /api/projects/:id/presentation/outline
 * The card-by-card outline for an uploaded brief or a topic. The AI runs
 * through scholarBrain; with no AI the outline is built from the brief's own
 * questions and sections (brief-grounded, never from a template).
 */
router.post(
  "/outline",
  asyncRoute(async (req: Request, res: Response) => {
    const store = getSharedStore();
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    const body = (req.body || {}) as Record<string, unknown>;
    const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
    const material = cleanBriefText(str(body.rawText, 60000));
    const topic = stripCourseCodes(str(body.topic, 300)).trim();
    const fileName = str(body.fileName, 200);
    const slideCount = Math.min(15, Math.max(4, Math.round(Number(body.slideCount)) || 8));
    const instruction = str(body.instruction, 500).trim();
    const current = Array.isArray(body.current)
      ? (body.current as Array<{ title?: unknown; bullets?: unknown }>).slice(0, 30).map((c) => ({
          title: str(c.title, 160),
          bullets: Array.isArray(c.bullets) ? (c.bullets as unknown[]).map((b) => str(b, 200)).slice(0, 8) : [],
        }))
      : undefined;
    if (!material.trim() && !topic) {
      return res.status(400).json({ error: "Add a topic or upload a document first." });
    }

    const derivedTitle = material.trim() ? deriveDocumentTitle(material, fileName) : topic;
    const fallback = () => ({ ...buildOutlineFromBrief(material.trim() ? material : topic, slideCount, topic || derivedTitle), generatedBy: "brief-grounded" as const });

    // Any connection counts, including one saved to the account and a local model only the browser can reach (426 hand-off).
    if ((await requestKeyring(req as never)).length > 0) {
      try {
        const raw = await scholarBrain.presentationOutline({
          req,
          material,
          topic: topic || undefined,
          slideCount,
          visualTypes: VISUAL_TYPES,
          instruction: instruction || undefined,
          current,
        });
        const parsed = outlineSchema.safeParse(raw);
        if (parsed.success) {
          let cards: OutlineCard[] = parsed.data.slides.map((c) => ({
            id: newOutlineId(),
            title: normalizeUnicodeNFC(sanitizeScholarlyText(stripCourseCodes(c.title))),
            visualType: (VISUAL_TYPES as readonly string[]).includes(c.visualType ?? "") ? (c.visualType as VisualType) : suggestVisualType(c.title, c.bullets ?? []),
            bullets: (c.bullets ?? []).map((b) => normalizeUnicodeNFC(sanitizeScholarlyText(stripCourseCodes(b)))).filter(Boolean).slice(0, 4),
          }));
          // Exactly the number asked for: extras are merged, a short answer is topped up from the brief.
          if (cards.length > slideCount) cards = fitOutline(cards, slideCount);
          if (cards.length < slideCount && material.trim()) {
            const have = new Set(cards.map((c) => c.title.toLowerCase()));
            const extra = buildOutlineFromBrief(material, slideCount, topic || derivedTitle).slides.filter((c) => !have.has(c.title.toLowerCase()) && c.visualType !== "Title Hero" && c.visualType !== "Key Takeaways");
            const last = cards.length > 2 ? cards.pop() : undefined;
            cards.push(...extra.slice(0, slideCount - cards.length - (last ? 1 : 0)));
            if (last) cards.push(last);
          }
          const aiTitle = (parsed.data.title ?? "").trim();
          const title = aiTitle && !isBannerLine(aiTitle) && !/\b[A-Z]{2,5}-\d{3,5}\b/.test(aiTitle) ? normalizeUnicodeNFC(sanitizeScholarlyText(aiTitle)) : derivedTitle;
          if (cards[0]) cards[0] = { ...cards[0], visualType: "Title Hero", title };
          return res.json({ success: true, title, slides: cards, generatedBy: "ai-gateway" });
        }
      } catch (aiErr) {
        if (aiErr instanceof BrowserAiRequiredError || aiErr instanceof InvalidLlmChallengeError) {
          return sendAiFailure(res, aiErr, "Presentation outline");
        }
        console.warn("[project/presentation.ts] AI outline fallback:", aiErr);
      }
    }
    return res.json({ success: true, ...fallback() });
  })
);

/**
 * POST /api/projects/:id/presentation/write-block
 * "Write with AI" for one block of a slide.
 */
router.post(
  "/write-block",
  asyncRoute(async (req: Request, res: Response) => {
    const store = getSharedStore();
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    const body = (req.body || {}) as Record<string, unknown>;
    const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
    const kind = str(body.kind, 60).trim() || "Key Insight Card";
    const slideTitle = str(body.slideTitle, 200).trim();
    const context = str(body.context, 4000);
    try {
      const raw = (await scholarBrain.writeSlideBlock({ req, kind, slideTitle, context, existing: str(body.existing, 400) || undefined })) as { title?: unknown; body?: unknown } | null;
      const title = typeof raw?.title === "string" ? raw.title.trim() : "";
      const text = typeof raw?.body === "string" ? raw.body.trim() : "";
      if (!title && !text) throw new UnusableAiResponseError("slide block");
      return res.json({
        success: true,
        title: normalizeUnicodeNFC(sanitizeScholarlyText(stripCourseCodes(title))),
        body: normalizeUnicodeNFC(sanitizeScholarlyText(stripCourseCodes(text))),
      });
    } catch (err) {
      return sendAiFailure(res, err, "Slide block");
    }
  })
);

/**
 * POST /api/projects/:id/presentation/generate-deck
 * Transforms research outline and narrative into a structured 16:9 slide deck.
 */
router.post(
  "/generate-deck",
  asyncRoute(async (req: Request, res: Response) => {
    const store = getSharedStore();
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;

    const body = (req.body || {}) as Record<string, unknown>;
    const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
    const AUDIENCE: Record<string, string> = { general: "General audience", executive: "Executive briefing", academic: "Academic seminar" };

    const durationMinutes = Math.min(180, Math.max(1, Number(body.durationMinutes) || 20));
    const targetAudience = str(body.targetAudience, 120) || AUDIENCE[str(body.audienceLevel, 20)] || "Academic Conference";
    const narrativeFramework = str(body.narrativeFramework, 60) || str(body.framework, 60) || "Standard-Narrative";
    // The presenter's reviewed card-by-card outline, when there is one.
    const outlineCards = Array.isArray(body.outline)
      ? (body.outline as Array<{ title?: unknown; visualType?: unknown; bullets?: unknown }>)
          .slice(0, 15)
          .map((c) => ({
            title: str(c.title, 160),
            visualType: str(c.visualType, 40),
            bullets: Array.isArray(c.bullets) ? (c.bullets as unknown[]).map((b) => str(b, 200)).filter(Boolean).slice(0, 6) : [],
          }))
          .filter((c) => c.title)
      : [];
    const requestedSlides = outlineCards.length >= 2 ? Math.min(15, outlineCards.length) : Math.min(15, Math.max(4, Number(body.slideCount) || 6));
    const userTopic = stripCourseCodes(str(body.topic, 300)).trim();
    const userText = cleanBriefText(str(body.rawText, 20000));
    // The presenter's plan: the one message to land and the points to make, in order.
    const keyMessage = str(body.keyMessage, 400);
    const talkPoints = Array.isArray(body.points)
      ? (body.points as unknown[]).map((p) => str(p, 300)).filter(Boolean).slice(0, 12)
      : [];

    const rawTitle = str(body.title, 300) || userTopic || (record.answers?.title as string) || "Academic Research Presentation";
    const projectTitle = normalizeUnicodeNFC(rawTitle);

    const answers = (record.answers || {}) as Record<string, unknown>;
    // Only the project's own data; no invented defaults.
    const researchQuestions: string[] = Array.isArray(answers.researchQuestions)
      ? (answers.researchQuestions as unknown[]).filter((q): q is string => typeof q === "string" && !!q.trim())
      : typeof answers.overarchingHypothesis === "string" && answers.overarchingHypothesis.trim()
      ? [answers.overarchingHypothesis as string]
      : [];

    const methodologyText =
      (typeof answers.methodology === "string" && answers.methodology) ||
      (typeof answers.methodologicalDesign === "string" && answers.methodologicalDesign) ||
      "";

    const empiricalNotes = (typeof answers.significanceStatement === "string" && answers.significanceStatement) || "";

    const sourcesSummary: string[] = Array.isArray(record.evidenceLedger?.sources)
      ? record.evidenceLedger.sources
          .slice(0, 6)
          .filter((s: { title?: string }) => !!s.title)
          .map((s: { title?: string; year?: number | string; doi?: string }) => `${s.title}${s.year ? ` (${s.year})` : ""}${s.doi ? `. DOI: ${s.doi}` : ""}`)
      : [];

    let generatedSlides: SlidePresentationItem[] | null = null;
    let generatedBy: "ai-gateway" | "heuristic-fallback" = "heuristic-fallback";
    let sourceCorpus = "";

    // 1. Multi-Portal & Knowledge Vault Evidence Retrieval via scholarBrain
    const rawVaultSources = Array.isArray(record.evidenceLedger?.sources) ? record.evidenceLedger.sources : [];
    const vaultSources = rawVaultSources.map((s) => ({
      ...s,
      year: s.year ?? "n.d.",
    }));
    const evidence = await scholarBrain.retrieveEvidence({
      query: `${projectTitle} ${researchQuestions.join(" ")}`,
      maxResults: 6,
      vaultSources,
    }).catch(() => []);

    // Any connection counts, including a local model only the browser can reach (426 hand-off).
    if ((await requestKeyring(req as never)).length > 0) {
      try {
        const systemPrompt = `You design presentation decks in the style of Gamma: each slide is a visual card, not a wall of bullets.
Write a ${requestedSlides}-card deck for the given topic and material.

Narrative: open with a title card, establish the problem or question, explain the key ideas and how they work, present the evidence, compare perspectives or options where relevant, and close with implications or a single takeaway.

For every card choose the layout that fits its content and vary layouts across the deck:
- "title": the opening card.
- "bento": 3-6 parallel ideas (items with a short title and one-line body).
- "stats": 1-4 headline figures (stats with value, label, optional detail). ONLY use figures that appear in the provided material. Never invent numbers, percentages, p-values or sample sizes.
- "timeline": 3-5 ordered steps or phases (items).
- "comparison": two sides, options or perspectives (columns: exactly 2, each with title and 2-5 points).
- "list": 2-5 key points beside the headline (items).
- "quote": a real quotation from the material (quote.text, quote.attribution). Never invent quotations.
- "split": a case or example with 2-4 items.
- "statement": one idea, centred (headline + optional lede).

Writing rules (assertion-evidence design):
- Headline: one clear academic assertion in at most 12 words that states the point of the card, or a structured title for the opening card. Never a question copied from the brief and never an institution banner or module code.
- Body blocks: crisp, scannable cards. Item titles max 8 words; each body 15-30 words, concrete and specific. No filler, no clichés ("delve", "tapestry", "testament", "underscores", "pivotal"), no raw prompt text.
- Cite only sources present in the material. If the material lacks evidence, write the card as a clear prompt for the author instead of inventing it.
- Speaker notes: 60-120 words of natural spoken delivery in the first person plural or singular, with a brief transition to the next card. Not a re-read of the slide.
- When an outline is given, write exactly one card per outline entry, in order, using the suggested visual type to choose the layout.
- Preserve NFC Unicode / diacritics.

Output strict JSON only:
{
  "deckTitle": "string",
  "slides": [
    {
      "slideNumber": 1,
      "type": "title" | "problem_gap" | "framework_methodology" | "empirical_findings" | "discussion_implications" | "references",
      "title": "card headline",
      "subtitle": "one-line lede",
      "keyPoints": ["short plain-text summary of the card's points"],
      "speakerNotes": "string",
      "targetDurationSeconds": 90,
      "card": {
        "layout": "${GAMMA_LAYOUT_IDS.join('" | "')}",
        "eyebrow": "2-3 word section label",
        "lede": "string or null",
        "items": [{ "title": "string", "body": "string" }],
        "stats": [{ "value": "string", "label": "string", "detail": "source or context" }],
        "columns": [{ "title": "string", "points": ["string"] }, { "title": "string", "points": ["string"] }],
        "quote": { "text": "string", "attribution": "string" },
        "takeaway": "string or null"
      }
    }
  ]
}`;

        const evidenceSummary = evidence.map((e) => `${e.citationToken}: ${e.title} (${e.year || "n.d."})`).join("; ");

        const userPrompt = [
          `Topic: ${projectTitle}`,
          `Audience: ${targetAudience}`,
          `Duration: ${durationMinutes} minutes (about ${Math.round((durationMinutes * 60) / requestedSlides)} seconds per card)`,
          keyMessage ? `Key message (open with it on the title card's lede and close with it as the final takeaway): ${keyMessage}` : "",
          outlineCards.length
            ? `Outline to follow (one card per entry, in order):\n${outlineCards.map((c, i) => `${i + 1}. ${c.title}${c.visualType ? ` [${c.visualType}]` : ""}${c.bullets.length ? `: ${c.bullets.join("; ")}` : ""}`).join("\n")}`
            : "",
          talkPoints.length ? `Points the presenter wants to make, in this order, one card each:\n${talkPoints.map((p, i) => `${i + 1}. ${p}`).join("\n")}` : "",
          `Narrative framework: ${narrativeFramework}`,
          researchQuestions.length ? `Research questions: ${JSON.stringify(researchQuestions)}` : "",
          methodologyText ? `Methodology: ${methodologyText}` : "",
          empiricalNotes ? `Key results: ${empiricalNotes}` : "",
          evidenceSummary || sourcesSummary.length ? `Verified sources: ${evidenceSummary || sourcesSummary.join("; ")}` : "",
          userText ? `Author's material:\n${userText}` : "",
        ]
          .filter(Boolean)
          .join("\n");
        sourceCorpus = userPrompt;

        const brainRes = await scholarBrain.complete({
          req,
          browserFallback: true,
          taskClass: "verification",
          systemPrompt,
          userPrompt,
          responseFormat: "json",
        });

        const rawJson = brainRes.parsedJson || (brainRes.text ? JSON.parse(brainRes.text.replace(/```json/g, "").replace(/```/g, "").trim()) : null);
        const parsed = rawJson as { slides?: Array<Record<string, unknown>> } | null;

        if (parsed && Array.isArray(parsed.slides) && parsed.slides.length >= 4) {
          generatedSlides = parsed.slides.map((s, idx) => ({
            slideNumber: (s.slideNumber as number) || idx + 1,
            type: (s.type as SlidePresentationItem["type"]) || "framework_methodology",
            title: normalizeUnicodeNFC(sanitizeScholarlyText((s.title as string) || "Empirical Synthesis")),
            subtitle: normalizeUnicodeNFC(sanitizeScholarlyText((s.subtitle as string) || "")),
            visualFocus: normalizeUnicodeNFC(sanitizeScholarlyText((s.visualFocus as string) || "")),
            keyPoints: Array.isArray(s.keyPoints)
              ? s.keyPoints.map((k: unknown) => normalizeUnicodeNFC(sanitizeScholarlyText(String(k))))
              : [],
            speakerNotes: normalizeUnicodeNFC(sanitizeScholarlyText((s.speakerNotes as string) || "")),
            targetDurationSeconds: (s.targetDurationSeconds as number) || 120,
            layoutType: (s.layoutType as SlidePresentationItem["layoutType"]) || "bullets",
            metricValue: (s.metricValue as string) || undefined,
            metricLabel: (s.metricLabel as string) || undefined,
            card: parseGammaCard(s.card, sourceCorpus),
          }));
          generatedBy = "ai-gateway";
        }
      } catch (aiErr) {
        // The browser hand-off is not a failure: pass it (or a bad challenge) to the client.
        if (aiErr instanceof BrowserAiRequiredError || aiErr instanceof InvalidLlmChallengeError) {
          return sendAiFailure(res, aiErr, "Presentation deck");
        }
        console.warn("[project/presentation.ts] AI deck generation fallback:", aiErr);
      }
    }

    if (!generatedSlides) {
      generatedSlides = generateProjectDerivedFallbackDeck(
        projectTitle,
        durationMinutes,
        targetAudience,
        researchQuestions,
        methodologyText,
        empiricalNotes,
        sourcesSummary
      );
    }

    const deckId = `deck-${record.projectId}`;
    const formattedDeck = buildSlideDeckFromItems(deckId, projectTitle, generatedSlides);

    // Persist into project intake answers and memory store
    try {
      const updatedAnswers = {
        ...answers,
        presentation_deck: formattedDeck,
      };
      await store.save({ ...record, answers: updatedAnswers });

      // Upsert into presentations memory table
      const now = new Date().toISOString();
      const presentationRow: PresentationDeckRow = {
        id: deckId,
        user_id: record.ownerId,
        project_id: record.projectId,
        title: projectTitle,
        topic: projectTitle,
        framework: narrativeFramework,
        theme_id: "scholar-paper",
        slides: (formattedDeck.slides as unknown[]),
        source_module: "presentation-studio",
        created_at: now,
        updated_at: now,
      };
      setMemoryDeck(deckId, presentationRow);

      const table = getDecksTable();
      if (table) {
        await table.upsert(presentationRow).catch(() => {});
      }
    } catch (saveErr) {
      console.warn("[project/presentation.ts] Failed to persist generated deck:", saveErr);
    }

    const response: GenerateDeckResponse = {
      success: true,
      deckTitle: projectTitle,
      totalSlides: generatedSlides.length,
      estimatedDurationMinutes: durationMinutes,
      slides: generatedSlides,
      narrativeFramework,
      targetAudience,
      generatedBy,
      deck: formattedDeck,
    };

    res.json(response);
  })
);

/**
 * POST /api/projects/:id/presentation/qa-simulate
 * Generates audience / referee questions and defense responses.
 */
router.post(
  "/qa-simulate",
  asyncRoute(async (req: Request, res: Response) => {
    const store = getSharedStore();
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;

    const rawTitle = (req.body && req.body.title) || (record.answers?.title as string) || "Academic Presentation";
    const projectTitle = normalizeUnicodeNFC(rawTitle);

    const answers = (record.answers || {}) as Record<string, unknown>;
    // Only the user's own research questions; never a placeholder question.
    const researchQuestions: string[] = (
      Array.isArray(answers.researchQuestions)
        ? (answers.researchQuestions as string[])
        : typeof answers.overarchingHypothesis === "string"
        ? [answers.overarchingHypothesis]
        : []
    ).filter((q) => typeof q === "string" && q.trim().length > 0);

    let qaScenarios: AudienceQuestion[] | null = null;
    const generatedBy = "ai-gateway" as const;

    {
      try {
        const rawQaSources = Array.isArray(record.evidenceLedger?.sources) ? record.evidenceLedger.sources : [];
        const qaVaultSources = rawQaSources.map((s) => ({
          ...s,
          year: s.year ?? "n.d.",
        }));
        const evidence = await scholarBrain.retrieveEvidence({
          query: `${projectTitle} ${researchQuestions.join(" ")}`,
          maxResults: 4,
          vaultSources: qaVaultSources,
        }).catch(() => []);

        const systemPrompt = `You are a distinguished Academic Conference Committee and Peer-Review Q&A Simulator.
Generate 3-4 rigorous, challenging questions from diverse referee/audience personas based on the provided academic project.
Personas:
- "Senior Conference Referee & Methodologist" (Difficulty: "adversarial", probes threats to validity, confounders, non-Markovian assumptions)
- "Theoretical Synthesizer & Session Chair" (Difficulty: "rigorous", probes ontological alignment, paradigm boundaries)
- "Applied Systems & Translation Critic" (Difficulty: "moderate", probes real-world scalability, computational overhead, latency)
- "External Examiner / Epistemic Adversary" (Difficulty: "adversarial", probes edge cases, dataset bias, ablation results)

For each question:
- questionId: string (e.g. "qa-1")
- audienceType: string
- difficultyLevel: "moderate" | "rigorous" | "adversarial"
- targetedSlideNumber: number (1-6)
- targetedTopic: string
- questionText: string (probing, highly articulate scholarly inquiry)
- probingIntent: string (underlying referee suspicion or test)
- suggestedAnswer: string (masterful, poised academic response)
- modelRebuttalStructure: string[] (3 bulleted strategic defense arguments)

Output ONLY valid JSON matching this schema:
{
  "projectTitle": "string",
  "qaScenarios": [
    {
      "questionId": "qa-1",
      "audienceType": "Senior Conference Referee",
      "difficultyLevel": "adversarial",
      "targetedSlideNumber": 3,
      "targetedTopic": "Methodological Rigor",
      "questionText": "string",
      "probingIntent": "string",
      "suggestedAnswer": "string",
      "modelRebuttalStructure": ["string", "string", "string"]
    }
  ]
}
Output ONLY valid JSON. Zero markdown codeblocks, zero conversational filler.`;

        const userPrompt = `Project Title: ${projectTitle}
Research Questions: ${JSON.stringify(researchQuestions)}
Audience Focus: ${req.body?.audienceFocus || "Academic Conference Reviewers"}
Slides: ${JSON.stringify(req.body?.slides || [])}
Grounded Evidence: ${JSON.stringify(evidence.map((e) => ({ title: e.title, token: e.citationToken })))}`;

        const brainRes = await scholarBrain.complete({
          req,
          browserFallback: true,
          taskClass: "verification",
          systemPrompt,
          userPrompt,
          responseFormat: "json",
        });

        const rawJson = brainRes.parsedJson || (brainRes.text ? JSON.parse(brainRes.text.replace(/```json/g, "").replace(/```/g, "").trim()) : null);
        const parsed = rawJson as { qaScenarios?: Array<Record<string, unknown>> } | null;

        if (parsed && Array.isArray(parsed.qaScenarios) && parsed.qaScenarios.length > 0) {
          qaScenarios = parsed.qaScenarios.map((q, idx) => ({
            questionId: (q.questionId as string) || `qa-${idx + 1}`,
            audienceType: normalizeUnicodeNFC(sanitizeScholarlyText((q.audienceType as string) || "Conference Referee")),
            difficultyLevel: (q.difficultyLevel as AudienceQuestion["difficultyLevel"]) || "rigorous",
            targetedSlideNumber: (q.targetedSlideNumber as number) || idx + 1,
            targetedTopic: normalizeUnicodeNFC(sanitizeScholarlyText((q.targetedTopic as string) || "Methodological Rigor")),
            questionText: normalizeUnicodeNFC(sanitizeScholarlyText((q.questionText as string) || "")),
            probingIntent: normalizeUnicodeNFC(sanitizeScholarlyText((q.probingIntent as string) || "")),
            suggestedAnswer: normalizeUnicodeNFC(sanitizeScholarlyText((q.suggestedAnswer as string) || "")),
            modelRebuttalStructure: Array.isArray(q.modelRebuttalStructure)
              ? q.modelRebuttalStructure.map((r: unknown) => normalizeUnicodeNFC(sanitizeScholarlyText(String(r))))
              : [],
          }));
        }
        if (!qaScenarios || qaScenarios.every((q) => !q.questionText)) {
          throw new UnusableAiResponseError("audience questions");
        }
      } catch (aiErr) {
        // No stand-in questions: the user sees that nothing was generated.
        return sendAiFailure(res, aiErr, "Audience questions");
      }
    }

    const response: QASimulateResponse = {
      success: true,
      projectTitle,
      qaScenarios,
      generatedBy,
    };

    res.json(response);
  })
);

/**
 * GET /api/projects/:id/presentation/deck
 * Retrieves the project's persistent presentation deck.
 */
router.get(
  "/deck",
  asyncRoute(async (req: Request, res: Response) => {
    const store = getSharedStore();
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;

    const answers = (record.answers || {}) as Record<string, unknown>;
    const savedDeck = (answers.presentation_deck || answers.presentationDeck) as
      | Record<string, unknown>
      | undefined;

    if (savedDeck) {
      return res.json({
        success: true,
        deck: savedDeck,
        version: record.version,
      });
    }

    // Check presentations memory store
    const deckId = `deck-${record.projectId}`;
    const memDeck = memoryDecks.get(deckId);
    if (memDeck) {
      return res.json({
        success: true,
        deck: memDeck,
        version: record.version,
      });
    }

    // Synthesize clean initial starter deck from project state
    const fallbackSlides = generateProjectDerivedFallbackDeck(
      (record.answers?.title as string) || "Academic Presentation",
      20,
      "Academic Conference",
      [],
      "",
      "",
      []
    );
    const starterDeck = buildSlideDeckFromItems(
      deckId,
      (record.answers?.title as string) || "Academic Presentation",
      fallbackSlides
    );

    res.json({
      success: true,
      deck: starterDeck,
      version: record.version,
    });
  })
);

/**
 * PUT /api/projects/:id/presentation/deck
 * Persists and autosaves the presentation deck with project version tracking.
 */
router.put(
  "/deck",
  asyncRoute(async (req: Request, res: Response) => {
    const store = getSharedStore();
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;

    const { deck } = req.body || {};
    if (!deck || typeof deck !== "object") {
      return res.status(400).json({ error: "Missing or invalid slide deck payload." });
    }

    const updatedAnswers = {
      ...(record.answers || {}),
      presentation_deck: deck,
    };

    const updated = await store.save({ ...record, answers: updatedAnswers });

    // Also synchronize into presentation_decks memory and Supabase table
    const deckId = (deck.id as string) || `deck-${record.projectId}`;
    const now = new Date().toISOString();
    const presentationRow: PresentationDeckRow = {
      id: deckId,
      user_id: record.ownerId,
      project_id: record.projectId,
      title: (deck.title as string) || (record.answers?.title as string) || "Academic Presentation",
      topic: (deck.topic as string) || (record.answers?.title as string) || "Academic Presentation",
      framework: (deck.framework as string) || "Standard-Narrative",
      theme_id: (deck.themeId as string) || "sand-academic",
      custom_theme: deck.customTheme || null,
      slides: Array.isArray(deck.slides) ? deck.slides : [],
      source_module: "presentation-studio",
      created_at: (deck.createdAt as string) || now,
      updated_at: now,
    };

    setMemoryDeck(deckId, presentationRow);

    const table = getDecksTable();
    if (table) {
      await table.upsert(presentationRow).catch(() => {});
    }

    res.json({
      success: true,
      deck,
      version: updated.version,
      autosavedAt: now,
    });
  })
);

export default router;
