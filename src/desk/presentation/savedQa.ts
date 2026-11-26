import type { AudienceQaQuestion } from '../../features/slides';

const DIFFICULTIES = ['moderate', 'rigorous', 'adversarial'] as const;
const text = (v: unknown) => (typeof v === 'string' ? v : '');

/**
 * The rehearsal questions saved on the project, read defensively: they come from stored answers (JSON text or
 * a list), so a damaged or older save must give an empty list or fewer questions, never a crash in the simulator.
 */
export function readSavedQaQuestions(raw: unknown): AudienceQaQuestion[] {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  return value.flatMap((q, i): AudienceQaQuestion[] => {
    if (!q || typeof q !== 'object') return [];
    const o = q as Record<string, unknown>;
    if (!text(o.question).trim()) return [];
    const slide = Number(o.targetSlideNumber);
    return [
      {
        id: text(o.id) || `qa-${i + 1}`,
        persona: text(o.persona),
        difficulty: (DIFFICULTIES as readonly string[]).includes(text(o.difficulty)) ? (o.difficulty as AudienceQaQuestion['difficulty']) : 'rigorous',
        targetSlideNumber: Number.isFinite(slide) && slide > 0 ? Math.round(slide) : i + 1,
        question: text(o.question),
        intent: text(o.intent),
        suggestedAnswer: text(o.suggestedAnswer),
        modelRebuttalPoints: Array.isArray(o.modelRebuttalPoints) ? o.modelRebuttalPoints.filter((p): p is string => typeof p === 'string') : [],
      },
    ];
  });
}
