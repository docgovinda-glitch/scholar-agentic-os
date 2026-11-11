/**
 * Brief handling for Presentation Studio (OT-22), shared by the browser and
 * the server. Pure functions only. Nothing here invents content: titles and
 * outline cards come from the uploaded text, with course codes and page
 * furniture removed first.
 */
import { stripCourseCodes } from "../utils/briefExtractor";
import { groupBriefQuestions, parseBriefQuestions, shortQuestionLabel, stripPageFurniture } from "../utils/briefQuestions";

export const VISUAL_TYPES = [
  "Title Hero",
  "2-Column Comparison",
  "3-Card Grid",
  "Process / Timeline",
  "Architecture Diagram",
  "Evidence & Metrics",
  "Key Takeaways",
] as const;
export type VisualType = (typeof VISUAL_TYPES)[number];

export interface OutlineCard {
  id: string;
  title: string;
  visualType: VisualType;
  bullets: string[];
}

/** Course codes ("QNT-4020"), page footers and page markers removed. */
export function cleanBriefText(text: string): string {
  return stripCourseCodes(stripPageFurniture(text || ""))
    .replace(/^\s*--\s*\d+\s+of\s+\d+\s*--\s*$/gim, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

const BANNER_START = /^(?:department|faculty|school|university|college|institute|centre|center|division)\b/i;
const METADATA = /^(?:module|course|unit|programme|program|word\s*count|marks?|submission|deadline|due|date|candidate|student|name|id|format|referencing|level|semester|academic\s+year|page|total)\b/i;
const GENERIC_HEADING = /^(?:assignment brief|essay prompt|module handbook|table of contents|contents|abstract|overview|introduction|instructions|part\s*\d+\b.*)$/i;

/** ALL-CAPS department/institution banners are never a presentation title. */
export function isBannerLine(line: string): boolean {
  const t = line.trim();
  if (BANNER_START.test(t)) return true;
  const letters = t.replace(/[^A-Za-z]/g, "");
  return letters.length >= 8 && letters.replace(/[^A-Z]/g, "").length / letters.length > 0.7;
}

const LABEL_PREFIX = /(assessment|brief|coursework|assignment|examination|exam|paper|handbook|case study)\s*$/i;

/**
 * The real topic of a document: the first line that is not an institution
 * banner or metadata. "Advanced Assessment: Branches of Quantum Computing"
 * gives "Branches of Quantum Computing".
 */
export function deriveDocumentTitle(text: string, fileName = ""): string {
  const lines = cleanBriefText(text)
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/^#+\s*/, "").replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim())
    .filter(Boolean)
    .slice(0, 25);
  for (const line of lines) {
    if (isBannerLine(line) || METADATA.test(line) || GENERIC_HEADING.test(line)) continue;
    let candidate = line;
    const colon = candidate.match(/^([^:]{3,60}):\s*(.{4,120})$/);
    if (colon && LABEL_PREFIX.test(colon[1].trim())) candidate = colon[2].trim();
    const words = candidate.split(/\s+/);
    if (words.length < 2 || words.length > 16 || candidate.length > 120) continue;
    if (/[.?!]$/.test(candidate) && words.length > 9) continue; // a sentence, not a title
    return candidate.replace(/[.:]+$/, "");
  }
  const base = fileName
    .replace(/\.[^/.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\d{3,5}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return base.replace(/\b\w/g, (c) => c.toUpperCase()) || "Untitled presentation";
}

/** Which card type suits a topic, from its own words. */
export function suggestVisualType(title: string, bullets: string[] = []): VisualType {
  const hay = `${title} ${bullets.join(" ")}`.toLowerCase();
  if (/\b(vs\.?|versus|compar|contrast|trade-?off|advantages? and|pros|cons|differ)/.test(hay)) return "2-Column Comparison";
  if (/\b(process|steps?|pipeline|workflow|stages?|timeline|roadmap|protocol|algorithm|procedure|phases?)\b/.test(hay)) return "Process / Timeline";
  if (/\b(architecture|hardware|circuit|system|framework|design|infrastructure|topology|diagram|codes?)\b/.test(hay)) return "Architecture Diagram";
  if (/\b(threshold|rate|result|metric|data|evidence|performance|cost|resource|estimate|accuracy|benchmark|scal)/.test(hay)) return "Evidence & Metrics";
  if (/\b(conclusion|summary|takeaway|implication|recommend|future|outlook)\b/.test(hay)) return "Key Takeaways";
  return "3-Card Grid";
}

let idCounter = 0;
export const newOutlineId = () => `ol-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

const clip = (t: string, n: number) => {
  const s = t.replace(/\s+/g, " ").trim();
  return s.length > n ? `${s.slice(0, n - 1).replace(/\s+\S*$/, "")}…` : s;
};

function bulletsFromText(text: string): string[] {
  return text
    .split(/(?<=[.;])\s+|;\s*|\s+—\s+/)
    .map((s) => clip(s.replace(/\([^)]*\d{4}[^)]*\)/g, "").replace(/[.;]+$/, ""), 90))
    .filter((s) => s.length >= 12)
    .slice(0, 4);
}

/** Fit an outline to exactly `count` cards where the material allows. */
export function fitOutline(cards: OutlineCard[], count: number): OutlineCard[] {
  const out = cards.slice();
  const min = Math.max(2, count);
  // Too many: merge the two shortest adjacent middle cards until it fits.
  while (out.length > min && out.length > 3) {
    let best = 1;
    let bestLen = Infinity;
    for (let i = 1; i < out.length - 2; i++) {
      const len = out[i].bullets.length + out[i + 1].bullets.length;
      if (len < bestLen) {
        bestLen = len;
        best = i;
      }
    }
    const a = out[best];
    const b = out[best + 1];
    out.splice(best, 2, { ...a, title: clip(`${a.title} & ${b.title}`, 70), bullets: [...a.bullets, ...b.bullets].slice(0, 4) });
  }
  return out;
}

/**
 * Brief-grounded outline used when no AI answers: one card per question (a
 * question's lettered parts become its bullets, or their own cards when more
 * cards are needed), framed by a title card and a takeaways card.
 */
export function buildOutlineFromBrief(text: string, slideCount: number, title?: string): { title: string; slides: OutlineCard[] } {
  const clean = cleanBriefText(text);
  const docTitle = title?.trim() || deriveDocumentTitle(clean);
  const count = Math.max(2, Math.min(15, Math.round(slideCount) || 8));
  const groups = groupBriefQuestions(parseBriefQuestions(clean));
  let body: OutlineCard[] = [];

  if (groups.length >= 2) {
    body = groups.map((g) => {
      const heading = shortQuestionLabel(g.stem?.text ?? g.title, 9);
      const bullets = g.parts.length ? g.parts.map((p) => clip(shortQuestionLabel(p.text, 14), 90)) : bulletsFromText(g.stem?.text ?? g.title);
      return { id: newOutlineId(), title: heading.charAt(0).toUpperCase() + heading.slice(1), visualType: suggestVisualType(heading, bullets), bullets: bullets.slice(0, 4) };
    });
    // Not enough cards: give the biggest multi-part questions a card per part.
    const need = count - 2 - body.length;
    if (need > 0) {
      const order = groups.map((g, i) => ({ g, i })).filter(({ g }) => g.parts.length > 1).sort((a, b) => b.g.parts.length - a.g.parts.length);
      let added = 0;
      for (const { g, i } of order) {
        if (added >= need) break;
        const extra = g.parts.slice(0, Math.min(g.parts.length, need - added + 1));
        const cards = extra.map((p) => {
          const t = shortQuestionLabel(p.text, 9);
          return { id: newOutlineId(), title: t.charAt(0).toUpperCase() + t.slice(1), visualType: suggestVisualType(t), bullets: bulletsFromText(p.text) };
        });
        body[i] = { ...body[i], __expand: cards } as OutlineCard & { __expand: OutlineCard[] };
        added += cards.length - 1;
      }
      body = body.flatMap((c) => {
        const ex = (c as OutlineCard & { __expand?: OutlineCard[] }).__expand;
        return ex ?? [c];
      });
    }
  } else {
    const paras = clean.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p.length > 40);
    body = paras.slice(0, Math.max(1, count - 2)).map((p) => {
      const heading = (p.match(/^#+\s*(.+)/)?.[1] ?? shortQuestionLabel(p.split(/(?<=[.!?])\s/)[0], 9)).trim();
      const bullets = bulletsFromText(p.replace(/^#+.*\n/, ""));
      return { id: newOutlineId(), title: clip(heading, 70), visualType: suggestVisualType(heading, bullets), bullets };
    });
  }

  // A bare topic (no questions or sections to ground in): structural headings only,
  // with empty bullets for the presenter to fill. No facts are supplied.
  if (body.length === 0) {
    const arc: Array<[string, VisualType]> = [
      [`Why ${docTitle} matters`, "3-Card Grid"],
      ["The key ideas", "3-Card Grid"],
      ["How it works", "Process / Timeline"],
      ["The evidence", "Evidence & Metrics"],
      ["Competing perspectives", "2-Column Comparison"],
      ["The system or structure", "Architecture Diagram"],
      ["Open questions", "3-Card Grid"],
      ["Implications", "3-Card Grid"],
    ];
    body = arc.slice(0, Math.max(1, count - 2)).map(([t, v]) => ({ id: newOutlineId(), title: t, visualType: v, bullets: [] }));
  }

  const cards: OutlineCard[] = [
    { id: newOutlineId(), title: docTitle, visualType: "Title Hero", bullets: [] },
    ...body,
    { id: newOutlineId(), title: "Key takeaways", visualType: "Key Takeaways", bullets: [] },
  ];
  return { title: docTitle, slides: fitOutline(cards, count) };
}
