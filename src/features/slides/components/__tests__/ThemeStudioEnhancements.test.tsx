// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import Step02Design from '../Step02Design';
import ThemeScreenshotCloner from '../ThemeScreenshotCloner';
import ThemeLibraryGrid from '../ThemeLibraryGrid';
import type { SlideDeck } from '../../types/slides';

const mockDeck: SlideDeck = {
  id: 'test-deck-studio',
  title: 'Why Zappos Pays New Hires to Quit',
  topic: 'Organizational Culture and Incentives',
  framework: 'Standard-Narrative',
  themeId: 'sand-academic',
  activeSlideIndex: 0,
  slides: [
    {
      id: 'slide-1',
      order: 1,
      actionHeadline: 'Why Zappos Pays New Hires $2,000 to Quit',
      framework: 'Standard-Narrative',
      speakerNotes: 'Notes for slide 1',
      blocks: [
        {
          type: 'bullet-list',
          items: ['Paying new hires weeds out non-committal employees', 'Reinforces extreme cultural alignment'],
        },
      ],
    },
  ],
};

describe('Theme Studio Enhancements (Step 02)', () => {
  it('renders the segmented control bar with Curated themes, Theme Library, and Clone from Screenshot', () => {
    const onUpdateDeck = vi.fn();
    const onPrev = vi.fn();
    const onNext = vi.fn();

    render(
      <Step02Design
        deck={mockDeck}
        onUpdateDeck={onUpdateDeck}
        onPrevStep={onPrev}
        onNextStep={onNext}
      />
    );

    // Segmented tab bar
    expect(screen.getByRole('tab', { name: /Curated \(\d+\)/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Explore Library|Theme Library/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Screenshot Cloner|Clone from Screenshot/i })).toBeInTheDocument();

    // Default tab is Curated (4)
    expect(screen.getByTestId('theme-card-sand-academic')).toBeInTheDocument();
    expect(screen.getByTestId('theme-card-minimal-clean')).toBeInTheDocument();
    expect(screen.getByTestId('theme-card-editorial-warm')).toBeInTheDocument();
    expect(screen.getByTestId('theme-card-deep-midnight')).toBeInTheDocument();
  });

  it('switches to Theme Library tab and filters themes by category and search query', () => {
    const onUpdateDeck = vi.fn();
    render(
      <Step02Design
        deck={mockDeck}
        onUpdateDeck={onUpdateDeck}
        onPrevStep={vi.fn()}
        onNextStep={vi.fn()}
      />
    );

    // Switch to Theme Library tab
    const libraryTab = screen.getByRole('tab', { name: /Explore Library|Theme Library/i });
    fireEvent.click(libraryTab);

    expect(screen.getByTestId('theme-library-grid')).toBeInTheDocument();

    // Category pills exist
    expect(screen.getByRole('tab', { name: /^All$/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^Academic$/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^Minimal$/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^Executive$/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^Editorial$/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^Apple/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^Scientific/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^Conference/i })).toBeInTheDocument();

    // Filter by Academic
    fireEvent.click(screen.getByRole('tab', { name: /^Academic$/i }));
    expect(screen.getByTestId('library-theme-card-sand-academic')).toBeInTheDocument();

    // Search for a specific theme
    const searchInput = screen.getByPlaceholderText(/Search themes/i);
    fireEvent.change(searchInput, { target: { value: 'Oxford' } });
    expect(screen.getByTestId('library-theme-card-oxford-navy')).toBeInTheDocument();

    // Clicking theme updates deck
    fireEvent.click(screen.getByTestId('library-theme-card-oxford-navy'));
    expect(onUpdateDeck).toHaveBeenCalledWith(
      expect.objectContaining({
        themeId: 'oxford-navy',
      })
    );
  });

  it('switches to Clone from Screenshot tab, loads sample palette, displays swatches, and applies theme', async () => {
    const onUpdateDeck = vi.fn();
    render(
      <Step02Design
        deck={mockDeck}
        onUpdateDeck={onUpdateDeck}
        onPrevStep={vi.fn()}
        onNextStep={vi.fn()}
      />
    );

    // Switch to cloner tab
    const clonerTab = screen.getByRole('tab', { name: /Screenshot Cloner|Clone from Screenshot/i });
    fireEvent.click(clonerTab);

    expect(screen.getByTestId('theme-screenshot-cloner')).toBeInTheDocument();
    expect(screen.getByText(/Clone Theme from Screenshot or Image/i)).toBeInTheDocument();
    expect(screen.getByTestId('screenshot-dropzone')).toBeInTheDocument();

    // Click sample Editorial Ochre
    const sampleBtn = screen.getByRole('button', { name: /Editorial Ochre/i });
    fireEvent.click(sampleBtn);

    // Swatches and live preview appear
    await waitFor(() => {
      expect(screen.getByTestId('extracted-palette-section')).toBeInTheDocument();
    });

    expect(screen.getByText('Canvas')).toBeInTheDocument();
    expect(screen.getByText('Card Surface')).toBeInTheDocument();
    expect(screen.getByText('Structural Text')).toBeInTheDocument();
    expect(screen.getByText('Accent Signal')).toBeInTheDocument();
    expect(screen.getByTestId('cloned-live-preview')).toBeInTheDocument();
    expect(screen.getAllByText(/Why Zappos Pays New Hires/i).length).toBeGreaterThan(0);

    // Apply Cloned Theme
    const applyBtn = screen.getByTestId('apply-cloned-theme-btn');
    fireEvent.click(applyBtn);

    expect(onUpdateDeck).toHaveBeenCalledWith(
      expect.objectContaining({
        customTheme: expect.objectContaining({
          source: 'cloned',
          accentColor: '#C2410C',
        }),
      })
    );
  });
});
