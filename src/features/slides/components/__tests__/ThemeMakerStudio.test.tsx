// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import ThemeMakerStudio from '../ThemeMakerStudio';
import type { SlideDeck } from '../../types/slides';

const mockDeck: SlideDeck = {
  id: 'test-deck-1',
  title: 'Autonomous Knowledge Grounding',
  themeId: 'sand-academic',
  aspectRatio: '16:9',
  slides: [
    {
      id: 'slide-1',
      slideNumber: 1,
      order: 1,
      layout: 'title-and-body',
      actionHeadline: 'Autonomous Knowledge Grounding in Multi-Agent Synthesis',
      categoryTag: 'Cognitive Science',
      methodologyNote: 'Methodology Phase 1',
      frameworkPhase: 'Executive Problem Statement',
      cognitiveLoadScore: 2,
      blocks: [
        {
          id: 'b-1',
          type: 'bullet-list',
          items: [
            'Rigorous 60/30/10 visual balance prevents slide clutter',
            'Direct evidence grounding with scholarly citations',
          ],
        },
      ],
    },
  ],
  createdAt: '2026-10-02T00:00:00.000Z',
  updatedAt: '2026-10-02T00:00:00.000Z',
};

describe('ThemeMakerStudio', () => {
  it('renders the studio with mode selectors and live 16:9 slide simulation', () => {
    const onApply = vi.fn();
    render(<ThemeMakerStudio deck={mockDeck} onApplyTheme={onApply} />);

    expect(screen.getByText(/AI Theme Maker & Cloner/i)).toBeInTheDocument();
    expect(screen.getByText(/📸 Look & Clone/i)).toBeInTheDocument();
    expect(screen.getByText(/💬 Describe with Prompt/i)).toBeInTheDocument();
    expect(screen.getByText(/🎛️ Manual Customizer/i)).toBeInTheDocument();

    // Verify 16:9 preview shows the slide headline
    expect(screen.getAllByText(/Autonomous Knowledge Grounding in Multi-Agent Synthesis/i).length).toBeGreaterThan(0);
  });

  it('switches to prompt mode and synthesizes Gamma Black Gold theme on sample click', () => {
    const onApply = vi.fn();
    render(<ThemeMakerStudio deck={mockDeck} onApplyTheme={onApply} />);

    const promptTab = screen.getByText(/💬 Describe with Prompt/i);
    fireEvent.click(promptTab);

    expect(screen.getByPlaceholderText(/e\.g\. Kimi Black Gold Ledger/i)).toBeInTheDocument();

    // Click sample prompt for Gamma Black Gold Ledger
    const sampleKimiBtn = screen.getByText(/Gamma Black Gold Ledger with golden curves & 3 VC metrics/i);
    fireEvent.click(sampleKimiBtn);

    // Verify preview updates to Black Gold Ledger
    expect(screen.getAllByText(/Black Gold Ledger \(AI Generated\)/i).length).toBeGreaterThan(0);
  });

  it('switches to manual mode and allows motif and color adjustments', () => {
    const onApply = vi.fn();
    render(<ThemeMakerStudio deck={mockDeck} onApplyTheme={onApply} />);

    const manualTab = screen.getByText(/🎛️ Manual Customizer/i);
    fireEvent.click(manualTab);

    // Select Cyber HUD Telemetry motif
    const cyberMotif = screen.getByText(/Cyber HUD Telemetry/i);
    fireEvent.click(cyberMotif);

    // Change theme name
    const nameInput = screen.getByDisplayValue(/My Custom Theme/i);
    fireEvent.change(nameInput, { target: { value: 'Cyberpunk Academic' } });

    // Apply & Save Theme
    const applyBtn = screen.getByText(/Save & Apply Theme to Presentation/i);
    fireEvent.click(applyBtn);

    expect(onApply).toHaveBeenCalledTimes(1);
    const appliedTheme = onApply.mock.calls[0][0];
    expect(appliedTheme.name).toBe('Cyberpunk Academic');
    expect(appliedTheme.visualMotif).toBe('cyber-hud');
  });
});
