// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import AskScholarPresentationDrawer, { SUGGESTED_PROMPT_PILLS } from '../AskScholarPresentationDrawer';
import type { SlideDeck } from '../../types/slides';

const mockDeck: SlideDeck = {
  id: 'deck-ask-scholar',
  title: 'Empirical Corporate Governance',
  topic: 'Executive Compensation and Risk Taking',
  slides: [
    {
      id: 's-1',
      order: 1,
      actionHeadline: 'Introduction to Executive Compensation',
      framework: 'Standard-Narrative',
      speakerNotes: 'Slide 1 notes',
      blocks: [
        {
          type: 'bullet-list',
          items: ['Compensation structures drive organizational risk', 'Stock options amplify downside volatility'],
        },
      ],
    },
    {
      id: 's-2',
      order: 2,
      actionHeadline: 'Empirical Methodology & Panel Data',
      framework: 'Standard-Narrative',
      speakerNotes: 'Slide 2 notes',
      blocks: [
        {
          type: 'bullet-list',
          items: ['10-year panel of S&P 500 firms', 'Fixed effects regression with clustered standard errors'],
        },
      ],
    },
  ],
  activeSlideIndex: 0,
};

describe('AskScholarPresentationDrawer', () => {
  it('renders drawer header, avatar, title, subtitle, and close button when open', () => {
    const onClose = vi.fn();
    render(
      <AskScholarPresentationDrawer
        deck={mockDeck}
        isOpen={true}
        onClose={onClose}
      />
    );

    expect(screen.getByTestId('ask-scholar-drawer')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ask Scholar' })).toBeInTheDocument();
    expect(screen.getByText(/Presentation Advisor & Slide Copilot/i)).toBeInTheDocument();

    const closeBtn = screen.getByLabelText('Close Ask Scholar drawer');
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not render when isOpen is false', () => {
    render(
      <AskScholarPresentationDrawer
        deck={mockDeck}
        isOpen={false}
        onClose={vi.fn()}
      />
    );

    expect(screen.queryByTestId('ask-scholar-drawer')).not.toBeInTheDocument();
  });

  it('renders all suggested action pills and clicking 6x6 audit produces audit report', async () => {
    render(
      <AskScholarPresentationDrawer
        deck={mockDeck}
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    for (const pill of SUGGESTED_PROMPT_PILLS) {
      expect(screen.getByText(pill)).toBeInTheDocument();
    }

    // Click "Audit slides for 6x6 bullet rule"
    const auditPill = screen.getByText('Audit slides for 6x6 bullet rule');
    fireEvent.click(auditPill);

    // User message is shown (and follow-up chip appears)
    expect(screen.getAllByText('Audit slides for 6x6 bullet rule').length).toBeGreaterThan(0);

    // Assistant response with 6x6 rule audit is rendered
    await waitFor(() => {
      expect(screen.getByText(/6x6 Rule Audit/i)).toBeInTheDocument();
    });
  });

  it('submits freeform query through bottom dock input pill and renders response', async () => {
    render(
      <AskScholarPresentationDrawer
        deck={mockDeck}
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    const input = screen.getByPlaceholderText('Ask Scholar for presentation advice...');
    fireEvent.change(input, {
      target: { value: 'How should I structure the opening hook for this presentation?' },
    });

    const sendBtn = screen.getByLabelText('Send message');
    fireEvent.click(sendBtn);

    expect(
      screen.getByText('How should I structure the opening hook for this presentation?')
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText(/Scholar Advisor/i).length).toBeGreaterThan(0);
    });
  });
});
