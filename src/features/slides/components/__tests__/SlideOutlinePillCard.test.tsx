// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import React from 'react';
import SlideOutlinePillCard from '../SlideOutlinePillCard';
import type { SlideCard } from '../../types/slides';

describe('SlideOutlinePillCard', () => {
  it('renders slide number pill, layout badge, action headline, and summary', () => {
    const slide: SlideCard = {
      id: 'slide-1',
      order: 1,
      actionHeadline: 'Why Zappos Pays New Hires $2,000 to Quit',
      summary: 'Analyzes how financial exit bonuses filter for genuine cultural alignment over short-term monetary motivation.',
      layoutType: 'metric-focus',
      framework: 'Standard-Narrative',
      frameworkPhase: 'Action Hook',
      blocks: [],
      speakerNotes: 'Slide 1: Why Zappos Pays New Hires $2,000 to Quit.',
    };

    render(<SlideOutlinePillCard slide={slide} index={0} />);

    expect(screen.getByTestId('slide-outline-pill-card-1')).toBeInTheDocument();
    expect(screen.getByText('Slide 1')).toBeInTheDocument();
    expect(screen.getByText('Metric Focus')).toBeInTheDocument();
    expect(screen.getByText('Why Zappos Pays New Hires $2,000 to Quit')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Analyzes how financial exit bonuses filter for genuine cultural alignment over short-term monetary motivation.'
      )
    ).toBeInTheDocument();
  });

  it('correctly maps 2-column layout labels and falls back gracefully to speakerNotes if summary is absent', () => {
    const slide: SlideCard = {
      id: 'slide-2',
      order: 2,
      actionHeadline: "Schein's Three Levels of Organizational Culture",
      layoutType: 'two-column',
      framework: 'Standard-Narrative',
      blocks: [],
      speakerNotes: "Deconstructs workplace culture across visible artifacts, espoused values, and basic assumptions.",
    };

    render(<SlideOutlinePillCard slide={slide} index={1} />);

    expect(screen.getByText('Slide 2')).toBeInTheDocument();
    expect(screen.getByText('2-Column Comparison')).toBeInTheDocument();
    expect(screen.getByText("Schein's Three Levels of Organizational Culture")).toBeInTheDocument();
    expect(
      screen.getByText(/Deconstructs workplace culture across visible artifacts/i)
    ).toBeInTheDocument();
  });
});
