// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import SlideCardBlock from '../SlideCardBlock';
import type {
  ActionHeaderBlock,
  MetricCalloutBlock,
  BulletListBlock,
  TwoColumnBlock,
  QuoteEvidenceBlock,
} from '../../types/slides';

describe('SlideCardBlock', () => {
  it('renders ActionHeaderBlock with 30pt-40pt typographic hierarchy scale', () => {
    const block: ActionHeaderBlock = {
      type: 'action-header',
      headline: 'Triangulated Survey Data Validates 14% Retention Drop',
      category: 'METHODOLOGY · VALIDATION',
      subheadline: 'Longitudinal empirical tracking across 1,000 students.',
    };

    render(<SlideCardBlock block={block} />);

    expect(screen.getByText('METHODOLOGY · VALIDATION')).toBeInTheDocument();
    const heading = screen.getByText('Triangulated Survey Data Validates 14% Retention Drop');
    expect(heading).toBeInTheDocument();
    expect(heading.className).toContain('text-2xl md:text-4xl font-bold');
    expect(heading.className).toContain('text-neutral-900 dark:text-neutral-100');
    expect(screen.getByText('Longitudinal empirical tracking across 1,000 students.')).toBeInTheDocument();
  });

  it('renders MetricCalloutBlock with 5xl-7xl bold scale and human-readable label', () => {
    const block: MetricCalloutBlock = {
      type: 'metric-callout',
      metric: '14%',
      label: 'Retention Reduction',
      context: 'Validated in empirical testing: first year persistence',
      trend: 'down',
    };

    render(<SlideCardBlock block={block} />);

    const metricEl = screen.getByText('14%');
    expect(metricEl).toBeInTheDocument();
    expect(metricEl.className).toContain('text-5xl md:text-7xl font-extrabold');
    expect(metricEl.className).toContain('text-blue-600 dark:text-blue-400');
    expect(screen.getByText('Retention Reduction')).toBeInTheDocument();
    expect(screen.getByText('Validated in empirical testing: first year persistence')).toBeInTheDocument();
  });

  it('renders BulletListBlock with 18pt body scale and accent bullet points', () => {
    const block: BulletListBlock = {
      type: 'bullet-list',
      items: [
        'Triangulated empirical data across cohorts',
        'Deterministic verification protocol guarantees integrity',
        'Cryptographic provenance ledger logs claims',
      ],
    };

    render(<SlideCardBlock block={block} />);

    const itemEl = screen.getByText('Triangulated empirical data across cohorts');
    expect(itemEl).toBeInTheDocument();
    const parentLi = itemEl.closest('li');
    expect(parentLi?.className).toContain('text-lg md:text-xl font-normal');
    expect(parentLi?.className).toContain('text-neutral-700 dark:text-neutral-300');
  });

  it('renders TwoColumnBlock with responsive grid containers', () => {
    const block: TwoColumnBlock = {
      type: 'two-column',
      leftTitle: 'Baseline Reality',
      leftContent: 'Hallucinated references contaminate academic pipelines',
      rightTitle: 'Grounded Breakthrough',
      rightContent: 'Zero-hallucination ledgers provide cryptographic proof',
    };

    render(<SlideCardBlock block={block} />);

    expect(screen.getByText('Baseline Reality')).toBeInTheDocument();
    expect(screen.getByText('Hallucinated references contaminate academic pipelines')).toBeInTheDocument();
    expect(screen.getByText('Grounded Breakthrough')).toBeInTheDocument();
    expect(screen.getByText('Zero-hallucination ledgers provide cryptographic proof')).toBeInTheDocument();
  });

  it('renders QuoteEvidenceBlock with border accent and attribution', () => {
    const block: QuoteEvidenceBlock = {
      type: 'quote-evidence',
      quote: 'Deterministic provenance is the cornerstone of academic credibility.',
      attribution: 'Dr. Evelyn Reed',
      citation: 'Reed et al., 2026',
    };

    render(<SlideCardBlock block={block} />);

    expect(
      screen.getByText('"Deterministic provenance is the cornerstone of academic credibility."')
    ).toBeInTheDocument();
    expect(screen.getByText(/Dr\. Evelyn Reed/)).toBeInTheDocument();
    expect(screen.getByText(/\[Reed et al\., 2026\]/)).toBeInTheDocument();
  });
});
