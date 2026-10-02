import { describe, it, expect } from 'vitest';
import {
  decomposeToUniversal5Beat,
  transformToActiveHeadline,
  applyBillboardFilter,
} from '../universalDecomposer';

describe('universalDecomposer', () => {
  it('generates a 5-beat deck from a freeform academic topic prompt', () => {
    const deck = decomposeToUniversal5Beat({
      topic: 'Quantum Computing & Fault-Tolerant Cryptographic Verification',
      framework: 'Universal-5Beat',
    });

    expect(deck.slides).toHaveLength(5);
    expect(deck.title).toBe('Quantum Computing & Fault-Tolerant Cryptographic Verification');

    // Beat 1: Action Hook
    const b1 = deck.slides[0];
    expect(b1.beatPhase).toBe('beat-1-action-hook');
    expect(b1.layoutType).toBe('metric-focus');
    expect(b1.blocks.some((b) => b.type === 'metric-callout')).toBe(true);

    // Beat 2: Tension & Context
    const b2 = deck.slides[1];
    expect(b2.beatPhase).toBe('beat-2-tension-context');
    const bulletBlock = b2.blocks.find((b) => b.type === 'bullet-list') as any;
    expect(bulletBlock).toBeDefined();
    expect(bulletBlock.items.length).toBeLessThanOrEqual(6);
    bulletBlock.items.forEach((item: string) => {
      const words = item.split(/\s+/).filter(Boolean);
      expect(words.length).toBeLessThanOrEqual(6);
    });

    // Beat 3: Mechanical Principle
    const b3 = deck.slides[2];
    expect(b3.beatPhase).toBe('beat-3-mechanical-principle');
    expect(b3.layoutType).toBe('two-column');
    expect(b3.blocks.some((b) => b.type === 'two-column')).toBe(true);

    // Beat 4: Empirical Proof
    const b4 = deck.slides[3];
    expect(b4.beatPhase).toBe('beat-4-empirical-proof');

    // Beat 5: Strategic Horizon
    const b5 = deck.slides[4];
    expect(b5.beatPhase).toBe('beat-5-strategic-horizon');
  });

  it('transforms passive academic labels into active analytical assertions', () => {
    expect(transformToActiveHeadline('overview', 'Quantum Algorithms')).toBe(
      'Strategic Overview of Current Paradigms in Quantum Algorithms'
    );
    expect(transformToActiveHeadline('methodology', 'Biomedical AI')).toBe(
      'Triangulated Empirical Framework and Execution in Biomedical AI'
    );
    expect(transformToActiveHeadline('results', 'Consensus Models')).toBe(
      'Key Empirical Benchmarks and Performance Gains in Consensus Models'
    );
  });

  it('applies the 3-second billboard filter: relegates explanatory paragraphs to speakerNotes', () => {
    const rawParagraph = `
- Point one
- Point two
This is a very long explanatory prose paragraph that exceeds two full lines of slide canvas and contains excessive detail that belongs in the speaker notes rather than cluttering the slide card.
    `;

    const { bulletItems, relegatedNotes } = applyBillboardFilter(rawParagraph);

    expect(bulletItems).toHaveLength(2);
    expect(relegatedNotes.length).toBeGreaterThan(0);
    expect(relegatedNotes[0]).toContain('very long explanatory prose');
  });

  it('deconstructs raw coursework markdown draft into 5 beats with metrics', () => {
    const markdown = `# Corporate Restructuring & Capital Allocation Under High Rates

## The Problem
Rising interest rates reduce liquidity by 42% across mid-market corporate enterprises.
- Liquidity contraction under elevated policy rates
- Escalating debt servicing burdens

## Methodology
Comparative empirical analysis of 500 corporate debt restructuring events.

## Results
Proactive debt maturity extension improves survival likelihood by 3.8x.`;

    const deck = decomposeToUniversal5Beat({
      text: markdown,
      framework: 'Universal-5Beat',
    });

    expect(deck.slides).toHaveLength(5);
    expect(deck.slides[0].actionHeadline).toContain('Rising interest rates reduce liquidity by 42%');
    expect(deck.slides[0].layoutType).toBe('metric-focus');
  });
});
