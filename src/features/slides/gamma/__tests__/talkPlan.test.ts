import { describe, it, expect } from 'vitest';
import { composeDeckFromPlan, slidesForMinutes } from '../composer';
import { getCardContent } from '../content';

const text = (deck: ReturnType<typeof composeDeckFromPlan>) => JSON.stringify(deck.slides);

describe('talk plan', () => {
  it('sizes the deck from the talk length: about a slide a minute plus title and close', () => {
    expect(slidesForMinutes(5)).toBe(6);
    expect(slidesForMinutes(10)).toBe(10);
    expect(slidesForMinutes(20)).toBe(15);
    expect(slidesForMinutes(60)).toBe(15);
    expect(slidesForMinutes(2)).toBe(4);
  });

  it("uses the presenter's title as written, the key message to open and close, and one card per point", () => {
    const deck = composeDeckFromPlan({
      title: 'FPGA decoders for surface codes',
      keyMessage: 'A pipelined FPGA decoder keeps up with a surface code in real time.',
      points: ['Software decoders fall behind at scale', 'We tested three boards', 'The pipelined design stayed under one microsecond'],
      talkMinutes: 10,
      audience: 'Technical / academic',
    });
    expect(deck.slides).toHaveLength(10);
    const cards = deck.slides.map(getCardContent);
    expect(cards[0].headline).toBe('FPGA decoders for surface codes');
    expect(cards[0].lede).toBe('A pipelined FPGA decoder keeps up with a surface code in real time.');
    expect(cards.slice(1, 4).map((c) => c.headline)).toEqual([
      'Software decoders fall behind at scale',
      'We tested three boards',
      'The pipelined design stayed under one microsecond',
    ]);
    expect(cards.at(-1)!.headline).toBe('A pipelined FPGA decoder keeps up with a surface code in real time.');
    expect(deck).toMatchObject({ talkMinutes: 10, keyMessage: expect.any(String), talkPoints: expect.any(Array) });
  });

  it('adds no figures, and points beyond the slide budget are not squeezed in', () => {
    const deck = composeDeckFromPlan({ title: 'T', points: ['a1', 'a2', 'a3', 'a4', 'a5'], slideCount: 4 });
    expect(deck.slides).toHaveLength(4);
    expect(deck.slides.map(getCardContent).map((c) => c.headline)).toEqual(['T', 'a1', 'a2', expect.stringContaining('remember')]);
    expect(text(deck)).not.toMatch(/\d+%|p\s*[<=]\s*0\.\d/);
  });

  it('without a key message it closes with a prompt to write one', () => {
    const deck = composeDeckFromPlan({ title: 'Urban heat', slideCount: 5 });
    expect(getCardContent(deck.slides.at(-1)!).headline).toMatch(/one thing to remember/i);
    expect(deck.keyMessage).toBeUndefined();
  });
});
