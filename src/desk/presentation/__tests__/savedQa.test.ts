import { describe, it, expect } from 'vitest';
import { readSavedQaQuestions } from '../savedQa';

const good = { id: 'q1', persona: 'Charge nurse', difficulty: 'adversarial', targetSlideNumber: 2, question: 'Why only night shifts?', intent: 'x', suggestedAnswer: 'y', modelRebuttalPoints: ['a', 'b'] };

describe('readSavedQaQuestions', () => {
  it('reads a saved list from JSON text or an array', () => {
    expect(readSavedQaQuestions(JSON.stringify([good]))).toEqual([good]);
    expect(readSavedQaQuestions([good])).toEqual([good]);
  });

  it('gives an empty list for anything that is not a list', () => {
    for (const bad of [null, undefined, '', '{"a":1}', 'not json', 5, { questions: [good] }, 'text']) expect(readSavedQaQuestions(bad), String(bad)).toEqual([]);
  });

  it('drops entries with no question and repairs the fields a damaged save left out', () => {
    const out = readSavedQaQuestions([null, 'x', { persona: 'no question' }, { question: 'Only a question', difficulty: 'bogus', targetSlideNumber: 'many', modelRebuttalPoints: [1, 'ok'] }]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 'qa-4', question: 'Only a question', difficulty: 'rigorous', targetSlideNumber: 4, persona: '', modelRebuttalPoints: ['ok'] });
  });
});
