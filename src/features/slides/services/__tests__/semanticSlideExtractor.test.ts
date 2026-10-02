import { describe, it, expect } from 'vitest';
import {
  extractSlidesFromAcademicText,
  condenseToSixWords,
  transformToActiveHeadline,
} from '../semanticSlideExtractor';

describe('semanticSlideExtractor', () => {
  describe('Zero Ghost Sources & Empty Documents', () => {
    it('returns an empty slide deck with zero phantom cards when text is empty', () => {
      const emptyDeck = extractSlidesFromAcademicText('');
      expect(emptyDeck.slides).toHaveLength(0);
      expect(emptyDeck.activeSlideIndex).toBe(0);
      expect(emptyDeck.title).toContain('Empty');
    });

    it('returns an empty slide deck when text is purely whitespace', () => {
      const emptyDeck = extractSlidesFromAcademicText('   \n\n\t   ');
      expect(emptyDeck.slides).toHaveLength(0);
    });
  });

  describe('6x6 Bullet Rule Enforcement', () => {
    it('condenses bullet text to a maximum of 6 words without trailing punctuation', () => {
      const longSentence = 'Triangulated survey data validates fourteen percent retention reduction across universities globally.';
      const condensed = condenseToSixWords(longSentence);
      const words = condensed.split(' ');
      expect(words.length).toBeLessThanOrEqual(6);
      expect(condensed).toBe('Triangulated survey data validates fourteen percent');
      expect(condensed).not.toMatch(/[,;:\-–—]$/);
    });

    it('keeps sentences with 6 words or fewer intact', () => {
      const short = 'Five verified academic citations analyzed';
      expect(condenseToSixWords(short)).toBe(short);
    });

    it('strips markdown bullet markers (- , * , 1.) before counting words', () => {
      const bullet = '- Bayesian consensus protocols eliminate fabricated references';
      const condensed = condenseToSixWords(bullet);
      const words = condensed.split(' ');
      expect(words.length).toBeLessThanOrEqual(6);
      expect(words[0]).not.toBe('-');
    });

    it('caps bullet list at a maximum of 6 items', () => {
      const sampleWithManyBullets = `
## Research Findings
- Point one about academic methodology
- Point two about verifiable ledgers
- Point three about peer review emulation
- Point four about precision accuracy
- Point five about statistical significance
- Point six about turnaround acceleration
- Point seven that exceeds the cognitive limit
- Point eight that also exceeds the limit
      `;
      const deck = extractSlidesFromAcademicText(sampleWithManyBullets);
      expect(deck.slides.length).toBeGreaterThan(0);
      const bulletBlock = deck.slides[0].blocks.find((b) => b.type === 'bullet-list');
      expect(bulletBlock).toBeDefined();
      if (bulletBlock && bulletBlock.type === 'bullet-list') {
        expect(bulletBlock.items.length).toBeLessThanOrEqual(6);
        bulletBlock.items.forEach((item) => {
          expect(item.split(/\s+/).length).toBeLessThanOrEqual(6);
        });
      }
    });
  });

  describe('Action Headline Transformation', () => {
    it('transforms "Research Methodology" into an active headline matching quantitative retention data', () => {
      const sample = `
## Research Methodology
Triangulated survey data validates 14% retention drop across first-year cohorts.
- Measured longitudinal persistence across cohorts
- Verified deterministic outcomes
      `;
      const headline = transformToActiveHeadline(
        'Research Methodology',
        'Triangulated survey data validates 14% retention drop across first-year cohorts.'
      );
      expect(headline).toBe('Triangulated Survey Data Validates 14% Retention Drop');
    });

    it('converts passive topic labels like "Results" and "Problem Statement" into action headlines', () => {
      const resultsHeadline = transformToActiveHeadline(
        'Results',
        'Citation precision reached 100% verified benchmark across test manuscripts.'
      );
      expect(resultsHeadline).toMatch(/Demonstrates|Confirms|Benchmark|Superiority/i);

      const problemHeadline = transformToActiveHeadline(
        'Problem Statement',
        'Hallucinated DOI citations contaminate academic literature without cryptographic verification.'
      );
      expect(problemHeadline).toMatch(/Fails|Invalidate|Contaminate|Limitations/i);
    });

    it('preserves existing high-conviction action headlines intact', () => {
      const active = 'Bayesian Multi-Agent Consensus Eliminates Fabricated Bibliographies';
      const preserved = transformToActiveHeadline(active, 'Content details...');
      expect(preserved).toBe(active);
    });
  });

  describe('Metric Callout Extraction', () => {
    it('extracts quantitative percentages, currency values, multipliers, and p-values', () => {
      const content = `
## Empirical Benchmarks
The platform achieved 100% citation precision while reducing turnaround by 4.2x. Over $2.4B was saved in manual auditing.
      `;
      const deck = extractSlidesFromAcademicText(content);
      const metricBlock = deck.slides[0].blocks.find((b) => b.type === 'metric-callout');
      expect(metricBlock).toBeDefined();
      if (metricBlock && metricBlock.type === 'metric-callout') {
        expect(['100%', '4.2x', '$2.4B']).toContain(metricBlock.metric);
      }
    });
  });

  describe('Narrative Frameworks', () => {
    const sampleText = `
# Autonomous Scholarly Synthesis
## Situation
Baseline academic synthesis relies on manual citation indexing.

## Complication
Hallucinated DOI references contaminate 84% of unverified synthesis pipelines.

## Resolution
Cryptographic vault ledgers guarantee 100% verified citation accuracy.
    `;

    it('correctly categorizes slides according to the SCR framework', () => {
      const deck = extractSlidesFromAcademicText(sampleText, 'SCR');
      expect(deck.slides).toHaveLength(3);
      expect(deck.slides[0].framework).toBe('SCR');
      expect(deck.slides[0].frameworkPhase).toBe('Situation');
      expect(deck.slides[1].frameworkPhase).toBe('Complication');
      expect(deck.slides[2].frameworkPhase).toBe('Resolution');
    });

    it('correctly categorizes slides according to the WhatIsCouldBe framework', () => {
      const deck = extractSlidesFromAcademicText(sampleText, 'WhatIsCouldBe');
      expect(deck.slides[0].framework).toBe('WhatIsCouldBe');
      expect(deck.slides[0].frameworkPhase).toBe('What Is');
      expect(deck.slides[1].frameworkPhase).toBe('What Could Be');
      expect(deck.slides[2].frameworkPhase).toBe('Call to Action');
    });

    it('correctly categorizes slides according to the ABT framework', () => {
      const deck = extractSlidesFromAcademicText(sampleText, 'ABT');
      expect(deck.slides[0].framework).toBe('ABT');
      expect(deck.slides[0].frameworkPhase).toBe('And');
      expect(deck.slides[1].frameworkPhase).toBe('But');
      expect(deck.slides[2].frameworkPhase).toBe('Therefore');
    });
  });

  describe('Two-Column and Quote Evidence', () => {
    it('extracts quotes into QuoteEvidenceBlock', () => {
      const quoteText = `
## Peer Review Testimonial
> "Deterministic provenance is the single most critical breakthrough for academic AI." — Prof. Elena Rostova
      `;
      const deck = extractSlidesFromAcademicText(quoteText);
      const quoteBlock = deck.slides[0].blocks.find((b) => b.type === 'quote-evidence');
      expect(quoteBlock).toBeDefined();
      if (quoteBlock && quoteBlock.type === 'quote-evidence') {
        expect(quoteBlock.quote).toContain('Deterministic provenance is the single most critical');
        expect(quoteBlock.attribution).toBe('Prof. Elena Rostova');
      }
    });
  });

  describe('Leave-Behind Provenance Extraction', () => {
    it('extracts in-text citations and DOIs for Standalone leave-behind view', () => {
      const textWithCitations = `
## Grounded Verification
Evaluated against empirical datasets (Vaswani et al., 2017) with DOI 10.1145/3313831.3376721.
- Validated reproducibility across 1,000 papers
      `;
      const deck = extractSlidesFromAcademicText(textWithCitations);
      expect(deck.slides[0].citations).toBeDefined();
      expect(deck.slides[0].citations).toContain('(Vaswani et al., 2017)');
      expect(deck.slides[0].methodologyNote).toContain('Vaswani et al.');
    });
  });
});
