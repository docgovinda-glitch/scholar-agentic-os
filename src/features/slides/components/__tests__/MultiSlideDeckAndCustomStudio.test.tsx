// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import MultiSlideDeckPreview from '../MultiSlideDeckPreview';
import CustomThemeStudio from '../CustomThemeStudio';
import DeckPreviewModal from '../DeckPreviewModal';
import type { SlideDeck } from '../../types/slides';

const mockDeck: SlideDeck = {
  id: 'deck-1',
  topic: 'Future of Autonomous Systems',
  title: 'Future of Autonomous Systems',
  targetAudience: 'Executive Leadership',
  audienceLevel: 'Executive',
  durationMinutes: 15,
  slideCount: 5,
  themeId: 'sand-academic',
  activeSlideIndex: 0,
  slides: [
    {
      id: 'slide-1',
      slideNumber: 1,
      layoutType: 'cover',
      actionHeadline: 'Autonomous Systems Paradigm',
      bulletPoints: ['Core insight'],
      blocks: [],
    },
    {
      id: 'slide-2',
      slideNumber: 2,
      layoutType: 'two-column',
      actionHeadline: 'Legacy Bottlenecks vs Modern Velocity',
      bulletPoints: ['Legacy latency', 'Modern sync'],
      blocks: [],
    },
  ],
};

const sampleTheme = {
  id: 'mckinsey-pyramid',
  name: 'McKinsey Pyramid Principle',
  category: 'executive',
  layoutArchetype: 'pyramid',
  mode: 'light' as const,
  canvasBg: '#F4F5F7',
  cardBg: '#FFFFFF',
  accent: '#002244',
  textPrimary: '#0F172A',
  textSecondary: '#64748B',
  fontFamily: 'sans' as const,
  visualMotif: 'minimal-frame',
  tagline: 'Top-down structured executive communication',
};

describe('MultiSlideDeckPreview (Canva & Gamma Style 5-Slide Progression)', () => {
  it('renders Slide 1 (Cover Hero) initially with title and metadata', () => {
    render(
      <MultiSlideDeckPreview
        theme={sampleTheme}
        deckTitle="Autonomous Systems Paradigm"
        initialSlide={0}
      />
    );

    expect(screen.getByText('01 Cover')).toBeInTheDocument();
    expect(screen.getByText('Autonomous Systems Paradigm')).toBeInTheDocument();
    expect(screen.getByText(/SCHOLAR OS · 2026/)).toBeInTheDocument();
  });

  it('navigates to Slide 2 (Executive Synthesis 2-Column Comparison)', () => {
    render(
      <MultiSlideDeckPreview
        theme={sampleTheme}
        deckTitle="Autonomous Systems Paradigm"
        initialSlide={0}
      />
    );

    // Click slide 2 button
    const slide2Btn = screen.getByRole('button', { name: 'Slide 2' });
    fireEvent.click(slide2Btn);

    expect(screen.getByText('02 Synthesis')).toBeInTheDocument();
    expect(screen.getByText('Strategic Friction vs. Accelerated Unlock')).toBeInTheDocument();
    expect(screen.getByText(/LEGACY INERTIA/)).toBeInTheDocument();
    expect(screen.getByText(/TARGET VALUE/)).toBeInTheDocument();
  });

  it('navigates to Slide 3 (Signature 2D Vector Framework)', () => {
    render(
      <MultiSlideDeckPreview
        theme={sampleTheme}
        deckTitle="Autonomous Systems Paradigm"
        initialSlide={0}
      />
    );

    const slide3Btn = screen.getByRole('button', { name: 'Slide 3' });
    fireEvent.click(slide3Btn);

    expect(screen.getByText('03 Framework')).toBeInTheDocument();
    expect(screen.getByText('GOVERNING THOUGHT')).toBeInTheDocument();
  });

  it('navigates to Slide 4 (Quantitative Metrics) and Slide 5 (Roadmap)', () => {
    render(
      <MultiSlideDeckPreview
        theme={sampleTheme}
        deckTitle="Autonomous Systems Paradigm"
        initialSlide={0}
      />
    );

    // Slide 4
    fireEvent.click(screen.getByRole('button', { name: 'Slide 4' }));
    expect(screen.getByText('04 Metrics')).toBeInTheDocument();
    expect(screen.getByText('+84.2%')).toBeInTheDocument();
    expect(screen.getByText('Retention')).toBeInTheDocument();

    // Slide 5
    fireEvent.click(screen.getByRole('button', { name: 'Slide 5' }));
    expect(screen.getByText('05 Roadmap')).toBeInTheDocument();
    expect(screen.getByText('Phase I: Architectural Alignment')).toBeInTheDocument();
  });

  it('calls onExpandAll when expand button is clicked', () => {
    const handleExpand = vi.fn();
    render(
      <MultiSlideDeckPreview
        theme={sampleTheme}
        showExpandButton={true}
        onExpandAll={handleExpand}
      />
    );

    const expandBtn = screen.getByRole('button', { name: 'Expand 5-Slide Deck Preview' });
    fireEvent.click(expandBtn);
    expect(handleExpand).toHaveBeenCalledTimes(1);
  });
});

describe('DeckPreviewModal', () => {
  it('renders all 5 slide stages simultaneously when open', () => {
    const handleApply = vi.fn();
    const handleClose = vi.fn();

    render(
      <DeckPreviewModal
        isOpen={true}
        onClose={handleClose}
        theme={sampleTheme}
        deckTitle="Autonomous Systems Paradigm"
        onApplyTheme={handleApply}
      />
    );

    expect(screen.getByText(/McKinsey Pyramid Principle · Full 5-Slide Presentation Deck/)).toBeInTheDocument();
    expect(screen.getByText('SLIDE 01')).toBeInTheDocument();
    expect(screen.getByText('SLIDE 02')).toBeInTheDocument();
    expect(screen.getByText('SLIDE 03')).toBeInTheDocument();
    expect(screen.getByText('SLIDE 04')).toBeInTheDocument();
    expect(screen.getByText('SLIDE 05')).toBeInTheDocument();

    // Apply button
    const applyBtn = screen.getByRole('button', { name: /Apply This Design/i });
    fireEvent.click(applyBtn);
    expect(handleApply).toHaveBeenCalledWith('mckinsey-pyramid');
  });
});

describe('CustomThemeStudio ("Bring Your Own Theme")', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders custom theme builder form with 60/30/10 color architecture and presets', () => {
    const handleUpdate = vi.fn();
    render(
      <CustomThemeStudio
        deck={mockDeck}
        onUpdateDeck={handleUpdate}
      />
    );

    expect(screen.getByText(/Bring Your Own Theme · Custom Design Studio/)).toBeInTheDocument();
    expect(screen.getByText('60 / 30 / 10 Color Architecture')).toBeInTheDocument();
    expect(screen.getByText('McKinsey Executive Navy')).toBeInTheDocument();
    expect(screen.getByText('Cupertino Space Modern')).toBeInTheDocument();
  });

  it('allows changing theme name and typography pairing', () => {
    const handleUpdate = vi.fn();
    render(
      <CustomThemeStudio
        deck={mockDeck}
        onUpdateDeck={handleUpdate}
      />
    );

    const nameInput = screen.getByPlaceholderText('e.g. McKinsey Strategic Navy');
    fireEvent.change(nameInput, { target: { value: 'Acme High Velocity' } });
    expect(nameInput).toHaveValue('Acme High Velocity');

    const serifBtn = screen.getByText('Editorial Serif');
    fireEvent.click(serifBtn);
    expect(serifBtn.closest('button')).toHaveClass('border-blue-600');
  });

  it('applies custom theme to the deck when Apply button is clicked', () => {
    const handleUpdate = vi.fn();
    render(
      <CustomThemeStudio
        deck={mockDeck}
        onUpdateDeck={handleUpdate}
      />
    );

    const applyBtn = screen.getByRole('button', { name: /Apply Custom Theme to Presentation Deck/i });
    fireEvent.click(applyBtn);

    expect(handleUpdate).toHaveBeenCalledTimes(1);
    const updated = handleUpdate.mock.calls[0][0];
    expect(updated.customTheme).toBeDefined();
    expect(updated.customTheme.accentColor).toBe('#2563EB');
  });

  it('saves custom theme to localStorage and shows it in My Saved Custom Themes', () => {
    const handleUpdate = vi.fn();
    render(
      <CustomThemeStudio
        deck={mockDeck}
        onUpdateDeck={handleUpdate}
      />
    );

    const saveBtn = screen.getByRole('button', { name: /Save to My Library/i });
    fireEvent.click(saveBtn);

    expect(screen.getByText(/My Saved Custom Themes/)).toBeInTheDocument();
  });

  it('starts from blank sheet when Blank Sheet button is clicked', () => {
    const handleUpdate = vi.fn();
    const handleProceed = vi.fn();
    render(
      <CustomThemeStudio
        deck={mockDeck}
        onUpdateDeck={handleUpdate}
        onProceedToStudio={handleProceed}
      />
    );

    const blankSheetBtn = screen.getByTestId('blank-sheet-btn');
    fireEvent.click(blankSheetBtn);

    expect(handleUpdate).toHaveBeenCalledTimes(1);
    const updated = handleUpdate.mock.calls[0][0];
    expect(updated.slides).toHaveLength(5);
    expect(updated.themeId).toBe('minimal-slate');
    expect(handleProceed).toHaveBeenCalledTimes(1);
  });

  it('renders upload presentation deck dropzone for recreating decks', () => {
    const handleUpdate = vi.fn();
    render(
      <CustomThemeStudio
        deck={mockDeck}
        onUpdateDeck={handleUpdate}
      />
    );

    expect(
      screen.getByText(/Upload Existing Presentation to Recreate Design/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Upload Presentation Deck/i })
    ).toBeInTheDocument();
  });
});
