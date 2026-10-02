// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import SlideCanvas from '../SlideCanvas';
import type { SlideDeck } from '../../types/slides';

describe('SlideCanvas', () => {
  const sampleDeck: SlideDeck = {
    id: 'deck-1',
    title: 'Autonomous Knowledge Grounding in Multi-Agent Synthesis',
    sourceModule: 'coursework',
    activeSlideIndex: 0,
    slides: [
      {
        id: 'slide-1',
        order: 1,
        actionHeadline: 'Triangulated Survey Data Validates 14% Retention Drop',
        framework: 'SCR',
        frameworkPhase: 'SITUATION · BASELINE',
        speakerNotes: 'Speak to empirical findings across 1,000 university cohorts.',
        methodologyNote: 'Longitudinal SRIS cohort tracking with Bayesian confidence interval [0.12, 0.16].',
        citations: ['(Reed et al., 2026)', 'DOI: 10.1145/3313831'],
        footnote: 'Scholar OS Verified Knowledge Grounding · Slide 1',
        blocks: [
          {
            type: 'action-header',
            headline: 'Triangulated Survey Data Validates 14% Retention Drop',
            category: 'SITUATION · BASELINE',
            subheadline: 'Multi-institutional study tracking first-year persistence.',
          },
          {
            type: 'metric-callout',
            metric: '14%',
            label: 'Retention Drop',
            context: 'Observed variance across unguided academic synthesis',
          },
        ],
      },
      {
        id: 'slide-2',
        order: 2,
        actionHeadline: 'Cryptographic Vault Ledgers Guarantee 100% Citation Precision',
        framework: 'SCR',
        frameworkPhase: 'RESOLUTION · BREAKTHROUGH',
        speakerNotes: 'Showcase deterministic zero-hallucination benchmark.',
        footnote: 'Scholar OS Verified Knowledge Grounding · Slide 2',
        blocks: [
          {
            type: 'action-header',
            headline: 'Cryptographic Vault Ledgers Guarantee 100% Citation Precision',
            category: 'RESOLUTION · BREAKTHROUGH',
          },
          {
            type: 'bullet-list',
            items: [
              'Zero-hallucination guarantee across 5,000 DOIs',
              'Sub-second deterministic verification latency',
            ],
          },
        ],
      },
    ],
  };

  it('renders a clean empty state card with zero phantom elements when deck has no slides', () => {
    const emptyDeck: SlideDeck = {
      id: 'deck-empty',
      title: 'Empty Presentation',
      sourceModule: 'coursework',
      slides: [],
      activeSlideIndex: 0,
    };

    render(<SlideCanvas deck={emptyDeck} />);

    expect(screen.getByTestId('slide-card-empty-state')).toBeInTheDocument();
    expect(screen.getByText('No Coursework Content Loaded')).toBeInTheDocument();
    expect(screen.queryByTestId('slide-card-active')).not.toBeInTheDocument();
    expect(screen.queryByTestId('slide-block-metric-callout')).not.toBeInTheDocument();
    expect(screen.queryByTestId('slide-block-bullet-list')).not.toBeInTheDocument();
  });

  it('renders active slide with 16:9 container, 60/30/10 tokens and action headline', () => {
    render(<SlideCanvas deck={sampleDeck} />);

    const viewport = screen.getByTestId('slide-canvas-viewport');
    expect(viewport.className).toContain('bg-[#F7F5F0]');
    expect(viewport.className).toContain('dark:bg-[#171717]');

    const card = screen.getByTestId('slide-card-active');
    expect(card.className).toContain('aspect-[16/9]');
    expect(card.className).toContain('min-h-[520px]');
    expect(card.className).toContain('bg-[#FFFFFF]');
    expect(card.className).toContain('dark:bg-[#1C1C1E]');

    expect(screen.getByText('Triangulated Survey Data Validates 14% Retention Drop')).toBeInTheDocument();
    expect(screen.getByText('14%')).toBeInTheDocument();
    expect(screen.getByText('01 / 02')).toBeInTheDocument();
  });

  it('switches between Stage Mode and Standalone Leave-Behind Mode showing citations and methodology', () => {
    render(<SlideCanvas deck={sampleDeck} initialViewMode="stage" />);

    // In Stage Mode: Minimal billboard clarity
    expect(screen.queryByTestId('leave-behind-footer')).not.toBeInTheDocument();
    expect(screen.getByText('Scholar OS Academic Presentation')).toBeInTheDocument();

    // Toggle to Standalone Leave-Behind Mode
    const leaveBehindBtn = screen.getByText('Leave-Behind');
    fireEvent.click(leaveBehindBtn);

    expect(screen.getByTestId('leave-behind-footer')).toBeInTheDocument();
    expect(screen.getByText(/SRIS cohort tracking with Bayesian confidence/)).toBeInTheDocument();
    expect(screen.getByText('(Reed et al., 2026)')).toBeInTheDocument();
    expect(screen.getByText('DOI: 10.1145/3313831')).toBeInTheDocument();
  });

  it('progresses to next slide when Next button is clicked', () => {
    const onSlideChange = vi.fn();
    render(<SlideCanvas deck={sampleDeck} onSlideChange={onSlideChange} />);

    expect(screen.getByText('01 / 02')).toBeInTheDocument();

    const nextBtn = screen.getByLabelText('Next slide');
    fireEvent.click(nextBtn);

    expect(screen.getByText('02 / 02')).toBeInTheDocument();
    expect(screen.getByText('Cryptographic Vault Ledgers Guarantee 100% Citation Precision')).toBeInTheDocument();
    expect(onSlideChange).toHaveBeenCalledWith(1);
  });
});
