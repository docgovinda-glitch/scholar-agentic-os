/**
 * Offline deck composer for Gamma-style cards.
 *
 * Runs in the browser when the AI generator is unavailable (signed out,
 * offline, no provider configured). It never invents evidence:
 *
 * - From the user's own text it builds cards out of their sentences. A number
 *   only becomes a stat card when that number is in the text, sequences become
 *   timelines, contrasts become comparisons, parallel points become bento
 *   grids, and the full prose is kept as speaker notes.
 * - From a bare topic it produces a structured scaffold whose placeholder text
 *   is clearly an instruction to the author, not a claim.
 */
import type { CardContent, CardItem, CardStat, GammaLayout, NarrativeFramework, SlideCard, SlideDeck } from '../types/slides';
import { getCardContent, inferLayout, writeCardContent } from './content';
import { DEFAULT_DECK_THEME_ID } from './theme';

/* ------------------------------------------------------------------------ */
/* Text utilities                                                            */
/* ------------------------------------------------------------------------ */

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

function splitSentences(text: string): string[] {
  return clean(text)
    // Keep "et al." and decimals together.
    .replace(/\bet al\./g, 'et al․')
    .split(/(?<=[.!?])\s+(?=[A-Z"“(\d])/)
    .map((s) => clean(s.replace(/․/g, '.')))
    .filter((s) => s.length > 2);
}

const words = (s: string) => s.split(/\s+/).filter(Boolean);
const trimPunct = (s: string) => s.replace(/^[\s,;:–—-]+|[\s,;:.–—-]+$/g, '');

function titleCase(s: string): string {
  const small = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'vs', 'via', 'with']);
  return words(s)
    .map((w, i) => (i > 0 && small.has(w.toLowerCase()) ? w.toLowerCase() : /[A-Z]{2,}/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Shortens to at most `max` words, cutting at a natural boundary. */
function shorten(s: string, max: number): string {
  const w = words(trimPunct(s));
  if (w.length <= max) return trimPunct(s);
  return `${w.slice(0, max).join(' ').replace(/[,;:]$/, '')}…`;
}

/** Turns a sentence into a card item: short title, the rest as body. */
function sentenceToItem(sentence: string): CardItem {
  const s = trimPunct(sentence);
  if (words(s).length <= 14) return { title: capitalize(s) };
  const cut = s.match(/^(.{12,80}?)(?:[,:;–—]\s+|\s+(?:because|which|so that|while|whereas|by)\s+)(.+)$/i);
  if (cut && words(cut[1]).length >= 3) {
    return { title: capitalize(trimPunct(cut[1])), body: capitalize(trimPunct(cut[2])) + '.' };
  }
  const split = splitSubject(s);
  if (split) return { title: capitalize(split.subject), body: capitalize(split.rest) + '.' };
  const w = words(s);
  return { title: capitalize(w.slice(0, 6).join(' ')), body: capitalize(w.slice(6).join(' ')) + '.' };
}

const VERBS =
  'adds|add|matches|match|is|are|was|were|has|have|had|offers|offer|reduces|reduce|increases|increase|improves|improve|requires|require|creates|create|keeps|keep|makes|make|provides|provide|costs|cost|leads|lead|means|mean|helps|help|allows|allow|supports|support|limits|limit|lowers|lower|raises|raise|drives|drive|shows|show|explains|explain|remains|remain|becomes|become|needs|need|faces|face|risks|risk|will|can|could|may|might|would|should|must';
const VERB_RE = new RegExp(`\\s(${VERBS})\\s`, 'i');

/** "Converting offices to homes adds central supply" → subject + rest. */
function splitSubject(sentence: string): { subject: string; rest: string } | null {
  const m = sentence.match(VERB_RE);
  if (!m || m.index === undefined) return null;
  const subject = trimPunct(sentence.slice(0, m.index));
  const rest = trimPunct(sentence.slice(m.index + 1));
  const n = words(subject).length;
  if (n < 2 || n > 8 || words(rest).length < 2) return null;
  return { subject, rest };
}

const NUMBER_RE = /([−–-]?\$?€?£?\d[\d,]*(?:\.\d+)?\s?(?:%|percent|x\b|×|k\b|m\b|bn\b|million|billion|thousand)?)/i;
const YEAR_RE = /^(1[89]|20)\d{2}$/;

/** Trims a label before trailing context ("between 2019 and 2021"), max 9 words. */
function cutAtContext(text: string): string {
  const w = words(trimPunct(text));
  const stop = w.findIndex((x, i) => i >= 3 && /^(between|during|since|from|over|across|compared|according|when|because|which)$/i.test(x));
  const kept = (stop > 0 ? w.slice(0, stop) : w).slice(0, 9);
  return trimPunct(kept.join(' '));
}

/** Extracts a stat from a sentence, using only numbers present in it. */
function sentenceToStat(sentence: string): CardStat | null {
  const s = trimPunct(sentence.replace(/\([^)]*\d{4}[^)]*\)/g, '')); // drop "(Author, 2022)" citations
  const re = new RegExp(NUMBER_RE.source, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const raw = clean(m[1]).replace(/\s?percent$/i, '%');
    const digits = raw.replace(/[^\d]/g, '');
    if (YEAR_RE.test(digits) && !/[%x×$€£]/.test(raw)) continue; // a year, not a figure
    if (digits.length === 0) continue;
    const after = trimPunct(s.slice(m.index + m[0].length));
    // The clause leading up to the number ("City-centre rents fell").
    const beforeClause = trimPunct(s.slice(0, m.index).split(/,|;|\b(?:while|whereas|and|but)\b/i).pop() || '');
    const afterIsContext = /^(in|during|since|between|by|from|over|across|at|on|after|before)\b/i.test(after);
    let label = '';
    if (after && !afterIsContext) label = cutAtContext(after);
    else if (words(beforeClause).length >= 2) label = cutAtContext(beforeClause);
    else label = cutAtContext(after || s);
    // Detail keeps the original sentence, citation included.
    return { value: raw.replace(/^-/, '−'), label: capitalize(label), detail: capitalize(trimPunct(sentence)) + '.' };
  }
  return null;
}

/* ------------------------------------------------------------------------ */
/* Parsing                                                                   */
/* ------------------------------------------------------------------------ */

interface Section {
  heading: string;
  body: string;
  bullets: string[];
}

function parseSections(text: string): { title?: string; intro: string; sections: Section[] } {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  let title: string | undefined;
  let intro = '';
  const sections: Section[] = [];
  let current: Section | null = null;
  for (const line of lines) {
    const h1 = line.match(/^#\s+(.+)/);
    const h2 = line.match(/^#{2,4}\s+(.+)/);
    const bullet = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.+)/);
    if (h1 && !title && !current) {
      title = clean(h1[1]);
    } else if (h2) {
      current = { heading: clean(h2[1]), body: '', bullets: [] };
      sections.push(current);
    } else if (bullet) {
      if (!current) {
        current = { heading: '', body: '', bullets: [] };
        sections.push(current);
      }
      current.bullets.push(clean(bullet[1]));
    } else if (current) {
      current.body += ` ${line}`;
    } else {
      intro += ` ${line}`;
    }
  }
  // No headings: chunk paragraphs into sections.
  if (!sections.length) {
    const paras = text.split(/\n\s*\n/).map(clean).filter(Boolean);
    const body = paras.length > 1 ? paras : splitSentences(intro);
    const size = paras.length > 1 ? 1 : 3;
    for (let i = 0; i < body.length; i += size) {
      sections.push({ heading: '', body: body.slice(i, i + size).join(' '), bullets: [] });
    }
    intro = '';
  }
  return { title, intro: clean(intro), sections: sections.filter((s) => clean(s.body) || s.bullets.length || s.heading) };
}

const SEQUENCE_HEADING = /\b(method|methods|methodology|process|steps?|approach|timeline|phases?|stages?|roadmap|how\b|procedure|workflow|plan)\b/i;
const SEQUENCE_SENTENCE = /^(first|firstly|second|secondly|then|next|after|finally|lastly|step\s*\d|phase\s*\d|stage\s*\d)\b/i;
const CONTRAST_HEADING = /\b(vs\.?|versus|compar\w*|options|alternatives|trade-?offs?|pros|cons|debate|perspectives)\b/i;
const CONTRAST_SENTENCE = /\b(while|whereas|versus|vs\.?|compared (?:with|to)|in contrast|on the other hand)\b/i;
const CONCLUSION_HEADING = /\b(conclusion|conclusions|summary|takeaways?|implications?|recommendations?|so what)\b/i;
const QUOTE_RE = /^[“"](.{20,})[”"]\s*(?:[—–-]\s*|\(\s*)?([^)]*)\)?$/;

/* ------------------------------------------------------------------------ */
/* Section → card                                                            */
/* ------------------------------------------------------------------------ */

function sectionToCard(sec: Section): { content: CardContent; layout: GammaLayout; notes: string } {
  const sentences = splitSentences(sec.body);
  const notes = clean([sec.body, ...sec.bullets.map((b) => `• ${b}`)].join(' '));
  const heading = sec.heading ? titleCase(sec.heading) : '';

  // Quote
  const quoteMatch = sentences.length <= 2 && sentences[0] ? clean(sentences[0]).match(QUOTE_RE) : null;
  if (quoteMatch) {
    return {
      layout: 'quote',
      notes,
      content: { headline: heading || 'In their words', items: [], stats: [], quote: { text: quoteMatch[1], attribution: clean(quoteMatch[2] || sentences[1] || '') || undefined } },
    };
  }

  // Stats: only numbers that are in the text.
  const statPairs = sentences.map((s) => ({ s, stat: sentenceToStat(s) })).filter((p) => p.stat) as Array<{ s: string; stat: CardStat }>;
  if (statPairs.length >= 2 || (statPairs.length === 1 && sentences.length <= 2)) {
    const used = new Set(statPairs.map((p) => p.s));
    const rest = sentences.filter((s) => !used.has(s));
    // A sentence carrying two figures ("fell 10% … while … rose 7%") becomes two stats.
    const stats: CardStat[] = [];
    for (const p of statPairs) {
      const parts = p.s.split(/\s*(?:,\s*)?\b(?:while|whereas|and|but)\b\s+/i).filter((x) => NUMBER_RE.test(x));
      const split = parts.map((part) => sentenceToStat(part)).filter(Boolean) as CardStat[];
      if (split.length > 1) split.forEach((st) => stats.push({ ...st, detail: undefined }));
      else stats.push(p.stat);
    }
    const headlineSrc = rest[0];
    return {
      layout: 'stats',
      notes,
      content: {
        eyebrow: heading || undefined,
        headline: headlineSrc && words(headlineSrc).length <= 16 ? trimPunct(headlineSrc) : heading || 'The numbers',
        lede: headlineSrc && words(headlineSrc).length > 16 ? trimPunct(headlineSrc) + '.' : undefined,
        items: [],
        stats: stats.slice(0, 4),
        takeaway: rest[1] ? trimPunct(rest[1]) + '.' : undefined,
      },
    };
  }

  const pool = sec.bullets.length ? sec.bullets : sentences;

  // Comparison
  const contrast = sentences.find((s) => CONTRAST_SENTENCE.test(s));
  if (CONTRAST_HEADING.test(sec.heading) || (contrast && pool.length <= 3)) {
    let left: string[] = [];
    let right: string[] = [];
    if (contrast && !CONTRAST_HEADING.test(sec.heading)) {
      const [a, b] = contrast.split(CONTRAST_SENTENCE).filter((x, i) => i !== 1);
      left = [trimPunct(a || '')];
      right = [trimPunct(b || '')];
    } else {
      const half = Math.ceil(pool.length / 2);
      left = pool.slice(0, half);
      right = pool.slice(half);
    }
    const col = (list: string[]) => {
      const head = list[0] ? splitSubject(trimPunct(list[0])) : null;
      const title = head ? head.subject : list[0] ? sentenceToItem(list[0]).title : '';
      const firstRest = head ? head.rest : list[0] ? sentenceToItem(list[0]).body : undefined;
      const points = [firstRest, ...list.slice(1)]
        .filter(Boolean)
        .flatMap((p) => (p as string).split(/;\s+|,\s+(?:and|but)\s+|\.\s+/))
        .map(trimPunct)
        .filter(Boolean);
      return { title: capitalize(title), points: points.map(capitalize) };
    };
    const columns: [{ title: string; points: string[] }, { title: string; points: string[] }] = [col(left), col(right)];
    return {
      layout: 'comparison',
      notes,
      content: { eyebrow: heading || undefined, headline: heading || 'Two sides of the question', items: [], stats: [], columns },
    };
  }

  // Sequence → timeline
  if (SEQUENCE_HEADING.test(sec.heading) || pool.filter((s) => SEQUENCE_SENTENCE.test(s)).length >= 2) {
    const items = pool.slice(0, 5).map((s) => sentenceToItem(s.replace(SEQUENCE_SENTENCE, '').replace(/^[,\s]+/, '')));
    return { layout: 'timeline', notes, content: { eyebrow: heading || undefined, headline: heading || 'How it works', items, stats: [] } };
  }

  // Conclusion → statement
  if (CONCLUSION_HEADING.test(sec.heading) && pool.length <= 2) {
    return {
      layout: 'statement',
      notes,
      content: { eyebrow: heading || undefined, headline: trimPunct(pool[0] || heading), lede: pool[1] ? trimPunct(pool[1]) + '.' : undefined, items: [], stats: [] },
    };
  }

  // Parallel points
  const parallel = pool.length >= 3;
  if (parallel) {
    const items = pool.slice(0, 6).map(sentenceToItem);
    return {
      layout: items.length >= 4 ? 'bento' : 'list',
      notes,
      content: { eyebrow: undefined, headline: heading || shorten(pool[0], 10), items, stats: [] },
    };
  }

  // One or two sentences: lead with the claim.
  const [first, ...others] = pool;
  return {
    layout: others.length ? 'list' : 'statement',
    notes,
    content: {
      eyebrow: heading || undefined,
      headline: first ? (words(first).length <= 16 ? trimPunct(first) : shorten(first, 14)) : heading,
      lede: first && words(first).length > 16 ? trimPunct(first) + '.' : undefined,
      items: others.map(sentenceToItem),
      stats: [],
    },
  };
}

/** Avoid three identical layouts in a row; keeps decks visually varied. */
function diversify(layouts: GammaLayout[]): GammaLayout[] {
  const out = [...layouts];
  for (let i = 2; i < out.length; i++) {
    if (out[i] === out[i - 1] && out[i] === out[i - 2]) {
      out[i] = out[i] === 'list' ? 'split' : out[i] === 'bento' ? 'list' : out[i];
    }
  }
  for (let i = 1; i < out.length; i++) {
    if (out[i] === 'list' && out[i - 1] === 'list') out[i] = 'split';
  }
  return out;
}

/* ------------------------------------------------------------------------ */
/* Public API                                                                */
/* ------------------------------------------------------------------------ */

export interface ComposeOptions {
  title?: string;
  topic?: string;
  slideCount?: number;
  framework?: NarrativeFramework;
  audience?: string;
  /** Keep this deck id (existing deck). */
  deckId?: string;
}

function makeSlide(i: number, content: CardContent, layout: GammaLayout, notes: string, framework: NarrativeFramework): SlideCard {
  const base: SlideCard = {
    id: `slide-${Date.now().toString(36)}-${i}`,
    order: i + 1,
    actionHeadline: content.headline,
    blocks: [],
    speakerNotes: notes,
    framework,
    frameworkPhase: layout,
  };
  return writeCardContent(base, content, layout);
}

function deckShell(opts: ComposeOptions, title: string, slides: SlideCard[]): SlideDeck {
  const now = new Date().toISOString();
  return {
    id: opts.deckId || `deck-${Date.now()}`,
    title,
    topic: opts.topic || title,
    sourceModule: 'presentation-studio',
    framework: opts.framework || 'Standard-Narrative',
    themeId: DEFAULT_DECK_THEME_ID,
    slides,
    activeSlideIndex: 0,
    createdAt: now,
    updatedAt: now,
  };
}

/** Build a deck from the user's own prose or Markdown. */
export function composeDeckFromText(text: string, opts: ComposeOptions = {}): SlideDeck {
  const framework = opts.framework || 'Standard-Narrative';
  const { title: mdTitle, intro, sections } = parseSections(text);
  const title = clean(opts.title || mdTitle || opts.topic || (sections[0]?.heading ?? '') || 'Untitled presentation');
  const max = Math.max(2, Math.min(15, opts.slideCount ?? 8));

  const cards = sections.slice(0, max - 1).map(sectionToCard);
  const layouts = diversify(cards.map((c) => c.layout));

  const introSentences = splitSentences(intro);
  const agenda = sections.map((s) => s.heading).filter(Boolean).slice(0, 5);
  const titleCard: CardContent = {
    eyebrow: agenda.length > 1 ? `${agenda.length} parts` : undefined,
    headline: titleCase(title),
    lede: introSentences[0] ? trimPunct(introSentences[0]) + '.' : agenda.length > 1 ? agenda.map(titleCase).join(' · ') : undefined,
    items: [],
    stats: [],
  };

  const slides = [
    makeSlide(0, titleCard, 'title', clean(intro) || `Introduce ${title}.`, framework),
    ...cards.map((c, i) => makeSlide(i + 1, c.content, layouts[i], c.notes, framework)),
  ];
  return deckShell(opts, title, slides);
}

const TOPIC_ARC: Array<{ layout: GammaLayout; build: (t: string) => CardContent; notes: (t: string) => string }> = [
  {
    layout: 'statement',
    build: (t) => ({
      eyebrow: 'Why it matters',
      headline: `What is at stake in ${t}?`,
      lede: 'Replace this with the single fact or tension your audience must hold on to.',
      items: [],
      stats: [],
    }),
    notes: (t) => `Open with the problem ${t} addresses and who it affects. One sentence, one source.`,
  },
  {
    layout: 'bento',
    build: (t) => ({
      eyebrow: 'Key ideas',
      headline: `The forces that shape ${t}`,
      items: [
        { title: 'Main driver', body: 'Name it in a few words, then one line on how it works.' },
        { title: 'Second driver', body: 'What amplifies or slows the first one?' },
        { title: 'Context', body: 'Where and when this holds.' },
        { title: 'Open question', body: 'What the field still disagrees on.' },
      ],
      stats: [],
    }),
    notes: () => 'Walk through each tile left to right. Keep one idea per tile.',
  },
  {
    layout: 'timeline',
    build: (t) => ({
      eyebrow: 'How it works',
      headline: `How ${t} unfolds`,
      items: [
        { title: 'Starting point', body: 'The situation before the change.' },
        { title: 'Trigger', body: 'What set things in motion.' },
        { title: 'Response', body: 'How people or systems adapted.' },
        { title: 'Outcome', body: 'Where things stand now.' },
      ],
      stats: [],
    }),
    notes: () => 'Narrate the sequence. Point at each step as you go.',
  },
  {
    layout: 'stats',
    build: () => ({
      eyebrow: 'Evidence',
      headline: 'What the evidence shows',
      items: [],
      stats: [
        { value: '—', label: 'Your strongest figure', detail: 'Add a number from a cited source in your Knowledge Vault.' },
        { value: '—', label: 'A comparison figure', detail: 'Before vs after, or this group vs that group.' },
        { value: '—', label: 'Scale or reach', detail: 'How many people, places or cases.' },
      ],
      takeaway: 'Add the one-line meaning of these numbers.',
    }),
    notes: () => 'Only present figures you can cite. Name the source as you say each number.',
  },
  {
    layout: 'comparison',
    build: (t) => ({
      eyebrow: 'Perspectives',
      headline: `Two ways to read ${t}`,
      items: [],
      stats: [],
      columns: [
        { title: 'One view', points: ['Its core claim', 'Strongest supporting evidence', 'Where it falls short'] },
        { title: 'The other view', points: ['Its core claim', 'Strongest supporting evidence', 'Where it falls short'] },
      ],
    }),
    notes: () => 'Present both sides fairly before saying which you find more convincing and why.',
  },
  {
    layout: 'list',
    build: (t) => ({
      eyebrow: 'Implications',
      headline: `What ${t} means in practice`,
      lede: 'Three consequences your audience can act on.',
      items: [
        { title: 'For practice', body: 'What should change in how people work or decide?' },
        { title: 'For policy', body: 'What rule, incentive or investment follows?' },
        { title: 'For research', body: 'What should be studied next?' },
      ],
      stats: [],
    }),
    notes: () => 'Translate the evidence into decisions. Be specific about who acts.',
  },
  {
    layout: 'quote',
    build: () => ({
      headline: 'In their words',
      items: [],
      stats: [],
      quote: { text: 'Paste a short quotation from a key source here.', attribution: 'Author, Year' },
    }),
    notes: () => 'Read the quotation slowly, then explain why it matters.',
  },
  {
    layout: 'split',
    build: (t) => ({
      eyebrow: 'Case study',
      headline: `${capitalize(t)} in a real setting`,
      lede: 'One concrete example makes the argument tangible.',
      items: [
        { title: 'Where and when', body: 'Set the scene.' },
        { title: 'What happened', body: 'The key events or decisions.' },
        { title: 'What it shows', body: 'Link back to your argument.' },
      ],
      stats: [],
    }),
    notes: () => 'Tell the case as a short story with a beginning, middle and end.',
  },
];

const CLOSING: { build: (t: string) => CardContent; notes: string } = {
  build: (t) => ({
    eyebrow: 'Takeaway',
    headline: `The one thing to remember about ${t}`,
    lede: 'Restate your answer to the opening question in a single sentence.',
    items: [],
    stats: [],
  }),
  notes: 'Close by answering the question you opened with, then invite questions.',
};

/** Structured starting deck for a bare topic when no AI generator is available. */
export function composeDeckFromTopic(topic: string, opts: ComposeOptions = {}): SlideDeck {
  const framework = opts.framework || 'Standard-Narrative';
  const t = clean(topic) || 'your topic';
  const short = words(t).length > 8 ? shorten(t, 8).replace(/…$/, '') : t;
  const lowerShort = /^[A-Z]{2,}/.test(short) ? short : short.charAt(0).toLowerCase() + short.slice(1);
  const count = Math.max(3, Math.min(15, opts.slideCount ?? 6));

  const slides: SlideCard[] = [
    makeSlide(
      0,
      { eyebrow: opts.audience || 'Presentation', headline: titleCase(t), lede: 'A structured starting point. Click any text to make it yours.', items: [], stats: [] },
      'title',
      `Introduce yourself and the question behind ${t}.`,
      framework,
    ),
  ];
  const middle = count - 2;
  for (let i = 0; i < middle; i++) {
    const arc = TOPIC_ARC[i % TOPIC_ARC.length];
    slides.push(makeSlide(slides.length, arc.build(lowerShort), arc.layout, arc.notes(lowerShort), framework));
  }
  slides.push(makeSlide(slides.length, CLOSING.build(lowerShort), 'statement', CLOSING.notes, framework));
  return deckShell({ ...opts, topic: t }, titleCase(t), slides);
}

/**
 * Converts a legacy block-based deck (e.g. a curated case-study deck) into
 * Gamma cards, choosing varied layouts and dropping any figure that does not
 * appear in `sourceText`.
 */
export function legacyDeckToGamma(deck: SlideDeck, sourceText = ''): SlideDeck {
  const haystack = sourceText.toLowerCase();
  const raw = deck.slides.map((s, i) => {
    const c = getCardContent(s);
    const stats = c.stats.filter((st) => haystack.includes(st.value.toLowerCase().replace('−', '-')) || haystack.includes(st.value.toLowerCase()));
    const content: CardContent = { ...c, stats };
    return { slide: s, content, layout: i === 0 ? ('title' as GammaLayout) : inferLayout(content, i) };
  });
  const layouts = diversify(raw.map((r) => r.layout));
  return {
    ...deck,
    // Keep the curated one-line outline summaries.
    slides: raw.map((r, i) => ({ ...writeCardContent(r.slide, r.content, layouts[i]), summary: r.slide.summary ?? r.content.lede })),
  };
}
