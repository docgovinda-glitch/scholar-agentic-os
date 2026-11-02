// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';
import {
  EditorialCoverSlide,
  EditorialMetricsSlide,
  EditorialCategoriesSlide,
} from '../SwissEditorialTemplates';
import { legacySwissEditorialDeck } from '../../__tests__/fixtures/legacySwissEditorialDeck';
import SlideCanvas from '../SlideCanvas';
import { SLIDE_THEMES } from '../../types/themes';
import type { SlideCard, SlideDeck } from '../../types/slides';

// Text the templates used to fill in when a slide field was empty.
const INVENTED = /Qingdao|Qing Plover|MIGRATORY BIRD SEASON|120,000|18,000|74\.2%|25\.8%|14,800|99\.4%|66 Patrol|ANNUAL CENSUS|Tidal Flat|HABITAT SANCTUARY|11\.07/;

const bare = (over: Partial<SlideCard>): SlideCard => ({
  id: 's', order: 1, actionHeadline: '', layoutType: 'cover', framework: 'Standard-Narrative', blocks: [], ...over,
} as SlideCard);

describe('SwissEditorialTemplates (Swiss hard-edge retro-poster look)', () => {
  const swissTheme = SLIDE_THEMES['swiss-editorial'];

  it('cover shows the slide’s own headline, banner, figures and summary bar', () => {
    const slide = bare({
      actionHeadline: 'Rural Clinic Wait Times',
      angledBanner: 'FIELD STUDY',
      subheadline: 'What drives the wait, and what shortens it.',
      calloutRibbon: 'Data from the user’s own survey.',
      summaryBar: 'Takeaway: triage order matters most.',
      blocks: [{ type: 'metric-callout', metric: '412', label: 'patients surveyed' }],
    });
    render(<EditorialCoverSlide slide={slide} slideIndex={0} totalSlides={3} theme={swissTheme} />);

    expect(screen.getByTestId('editorial-cover-slide')).toBeInTheDocument();
    expect(screen.getByText('Rural Clinic Wait Times')).toBeInTheDocument();
    expect(screen.getByText('FIELD STUDY')).toBeInTheDocument();
    expect(screen.getByText('412')).toBeInTheDocument();
    expect(screen.getByText('patients surveyed')).toBeInTheDocument();
    expect(screen.getByText(/triage order matters most/)).toBeInTheDocument();
    const summaryBar = screen.getByTestId('persistent-dark-summary-bar');
    expect(summaryBar.className).toContain('bg-neutral-900');
    expect(summaryBar.className).toContain('text-white');
  });

  it('metrics slide shows the slide’s own figures and ratio', () => {
    const slide = bare({
      layoutType: 'metrics',
      actionHeadline: 'Triage cut the median wait',
      blocks: [{ type: 'metric-callout', metric: '38 min', label: 'MEDIAN WAIT', context: 'after triage' }],
      ratioComparison: { labelA: 'Triaged', percentA: 60, labelB: 'Walk-in', percentB: 40, ratio: '3 : 2', insight: 'From the user’s data.' },
    });
    render(<EditorialMetricsSlide slide={slide} slideIndex={1} totalSlides={3} theme={swissTheme} />);

    expect(screen.getByText('Triage cut the median wait')).toBeInTheDocument();
    expect(screen.getByText('38 min')).toBeInTheDocument();
    expect(screen.getByText('MEDIAN WAIT')).toBeInTheDocument();
    expect(screen.getByText('60%')).toBeInTheDocument();
    expect(screen.getByText('Triaged')).toBeInTheDocument();
  });

  it('categories slide shows the slide’s own pillars', () => {
    const slide = bare({
      layoutType: 'categories',
      actionHeadline: 'Three changes',
      pillars: [
        { id: 'a', title: 'TRIAGE', points: ['Nurse-led triage'], accentColor: 'red' },
        { id: 'b', title: 'SCHEDULING', points: ['Booked slots'], accentColor: 'blue' },
      ],
    } as Partial<SlideCard>);
    render(<EditorialCategoriesSlide slide={slide} slideIndex={2} totalSlides={3} theme={swissTheme} />);

    expect(screen.getByText('TRIAGE')).toBeInTheDocument();
    expect(screen.getByText('SCHEDULING')).toBeInTheDocument();
  });

  it.each([
    ['cover', EditorialCoverSlide],
    ['metrics', EditorialMetricsSlide],
    ['categories', EditorialCategoriesSlide],
  ] as const)('an empty %s slide shows nothing invented', (_name, Template) => {
    const { container } = render(<Template slide={bare({})} slideIndex={0} totalSlides={1} theme={swissTheme} />);
    expect(container.textContent).not.toMatch(INVENTED);
    expect(container.textContent).toContain('Untitled slide');
  });

  it('a deck saved by an earlier version still renders', () => {
    const deck = legacySwissEditorialDeck({ topic: 'Plover migration' });
    render(<EditorialCoverSlide slide={deck.slides[0]} slideIndex={0} totalSlides={deck.slides.length} theme={swissTheme} />);
    expect(screen.getByText(/Plover migration/)).toBeInTheDocument();
  });

  it('SlideCanvas renders 16:9 container, floating bottom dock with navigation and PDF export button', () => {
    const deck: SlideDeck = legacySwissEditorialDeck();
    const mockExportPdf = vi.fn();

    render(<SlideCanvas deck={deck} theme={swissTheme} initialSlideIndex={0} onExportPdf={mockExportPdf} />);

    const slideCard = screen.getByTestId('slide-card-active');
    expect(slideCard.className).toContain('aspect-[16/9]');
    expect(screen.getByRole('navigation', { name: /Presentation controls/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Next slide/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Previous slide/i)).toBeInTheDocument();
    const pdfBtn = screen.getByRole('button', { name: /Export to PDF/i });
    pdfBtn.click();
    expect(mockExportPdf).toHaveBeenCalledTimes(1);
  });
});
