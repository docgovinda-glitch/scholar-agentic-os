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
import { decomposeToSwissEditorial } from '../../services/universalDecomposer';
import SlideCanvas from '../SlideCanvas';
import { SLIDE_THEMES } from '../../types/themes';
import type { SlideDeck } from '../../types/slides';

describe('SwissEditorialTemplates (Swiss Hard-Edge Retro-Poster Aesthetic)', () => {
  const swissTheme = SLIDE_THEMES['swiss-editorial'];

  it('renders EditorialCoverSlide matching Image 1 reference with angled banner, split photo window, and dark summary bar', () => {
    const deck = decomposeToSwissEditorial({
      topic: 'Qing Plover: Migratory Bird Season',
    });
    const coverSlide = deck.slides[0];

    render(
      <EditorialCoverSlide
        slide={coverSlide}
        slideIndex={0}
        totalSlides={deck.slides.length}
        theme={swissTheme}
      />
    );

    // Directive 1: Warm cream canvas, serif title, persistent dark bottom summary bar
    expect(screen.getByTestId('editorial-cover-slide')).toBeInTheDocument();
    expect(screen.getByText(/Qing Plover/i)).toBeInTheDocument();
    expect(screen.getByText('MIGRATORY BIRD SEASON')).toBeInTheDocument();
    expect(screen.getByText('11.07—11.13')).toBeInTheDocument();
    expect(
      screen.getByText(/Migratory birds arrive, and the city makes room/i)
    ).toBeInTheDocument();

    // 3 metrics with red dividers
    expect(screen.getByText('120,000')).toBeInTheDocument();
    expect(screen.getByText('migratory birds')).toBeInTheDocument();

    // Persistent dark bottom summary bar
    const summaryBar = screen.getByTestId('persistent-dark-summary-bar');
    expect(summaryBar).toBeInTheDocument();
    expect(summaryBar.className).toContain('bg-neutral-900');
    expect(summaryBar.className).toContain('text-white');
  });

  it('renders EditorialMetricsSlide with high-contrast ratio comparison bars and oversized stat callouts', () => {
    const deck = decomposeToSwissEditorial({
      topic: 'Coastal Mudflat Ecological Census',
    });
    const metricsSlide = deck.slides[1];

    render(
      <EditorialMetricsSlide
        slide={metricsSlide}
        slideIndex={1}
        totalSlides={deck.slides.length}
        theme={swissTheme}
      />
    );

    expect(screen.getByTestId('editorial-metrics-slide')).toBeInTheDocument();
    expect(screen.getByText(/Tidal Flat Carrying Capacity/i)).toBeInTheDocument();

    // High-contrast segmented ratio bar (74.2% vs 25.8%)
    expect(screen.getAllByText('74.2%').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('25.8%')).toBeInTheDocument();
    expect(screen.getByText(/Core Protected Tidal Habitat/i)).toBeInTheDocument();
    expect(screen.getByText(/Urban Coastal Buffer Zone/i)).toBeInTheDocument();

    // Oversized stat callout
    expect(screen.getByText('ANNUAL CENSUS')).toBeInTheDocument();
    expect(screen.getByText('120,000')).toBeInTheDocument();

    // Persistent dark bottom summary bar
    const summaryBar = screen.getByTestId('persistent-dark-summary-bar');
    expect(summaryBar).toBeInTheDocument();
    expect(summaryBar.className).toContain('bg-neutral-900');
  });

  it('renders EditorialCategoriesSlide with solid color-blocked columns for pillar breakdowns', () => {
    const deck = decomposeToSwissEditorial({
      topic: 'Triple Pillar Conservation Masterplan',
    });
    const categoriesSlide = deck.slides[2];

    render(
      <EditorialCategoriesSlide
        slide={categoriesSlide}
        slideIndex={2}
        totalSlides={deck.slides.length}
        theme={swissTheme}
      />
    );

    expect(screen.getByTestId('editorial-categories-slide')).toBeInTheDocument();
    expect(screen.getByText(/Three Foundational Pillars/i)).toBeInTheDocument();

    // 3 color-blocked pillars: Habitat Sanctuary, Autonomous Sensing, Community Guardians
    expect(screen.getByText('HABITAT SANCTUARY')).toBeInTheDocument();
    expect(screen.getByText('AUTONOMOUS SENSING')).toBeInTheDocument();
    expect(screen.getByText('COMMUNITY GUARDIANS')).toBeInTheDocument();
    expect(screen.getByText('14,800 Hectares')).toBeInTheDocument();
    expect(screen.getByText('99.4% Uptime')).toBeInTheDocument();
    expect(screen.getByText('66 Patrol Paths')).toBeInTheDocument();

    // Persistent dark bottom summary bar
    const summaryBar = screen.getByTestId('persistent-dark-summary-bar');
    expect(summaryBar).toBeInTheDocument();
    expect(summaryBar.className).toContain('bg-neutral-900');
  });

  it('SlideCanvas renders 16:9 container, floating bottom dock with navigation and PDF export button', () => {
    const deck: SlideDeck = decomposeToSwissEditorial();
    const mockExportPdf = vi.fn();

    render(
      <SlideCanvas
        deck={deck}
        theme={swissTheme}
        initialSlideIndex={0}
        onExportPdf={mockExportPdf}
      />
    );

    // 16:9 responsive slide container
    const slideCard = screen.getByTestId('slide-card-active');
    expect(slideCard).toBeInTheDocument();
    expect(slideCard.className).toContain('aspect-[16/9]');

    // Floating bottom controller
    expect(
      screen.getByRole('navigation', { name: /Presentation controls/i })
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Next slide/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Previous slide/i)).toBeInTheDocument();

    // PDF Export button in dock
    const pdfBtn = screen.getByRole('button', { name: /Export to PDF/i });
    expect(pdfBtn).toBeInTheDocument();
    pdfBtn.click();
    expect(mockExportPdf).toHaveBeenCalledTimes(1);
  });
});
