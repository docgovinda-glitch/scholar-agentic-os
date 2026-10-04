// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import InSlidePromptCopilot, { QUICK_MUTATION_CHIPS } from '../InSlidePromptCopilot';
import type { SlideCard } from '../../types/slides';

describe('InSlidePromptCopilot', () => {
  const mockSlide: SlideCard = {
    id: 's-1',
    order: 1,
    actionHeadline: 'Overview of Cultural Alignment in Organizations',
    blocks: [
      {
        type: 'bullet-list',
        items: [
          'Detailed bullet point describing how Schein identifies artifacts',
          'Second point on organizational values and underlying assumptions',
        ],
      },
    ],
    speakerNotes: '',
    framework: 'Standard-Narrative',
  };

  it('renders prompt input pill and all 5 quick transformation chips', () => {
    render(
      <InSlidePromptCopilot
        currentSlide={mockSlide}
        deckId="deck-123"
        onMutateSlide={vi.fn()}
      />
    );

    expect(screen.getByPlaceholderText(/Ask AI to mutate this slide/i)).toBeInTheDocument();
    expect(screen.getByText(/Make More Concise/i)).toBeInTheDocument();
    expect(screen.getByText(/Convert to Split Image/i)).toBeInTheDocument();
    expect(screen.getByText(/Highlight as Big Metric/i)).toBeInTheDocument();
    expect(screen.getByText(/Change to 2-Column Comparison/i)).toBeInTheDocument();
    expect(screen.getByText(/Strengthen Active Voice/i)).toBeInTheDocument();
  });

  it('triggers onMutateSlide when a quick action chip is clicked', () => {
    const handleMutate = vi.fn();
    render(
      <InSlidePromptCopilot
        currentSlide={mockSlide}
        deckId="deck-123"
        onMutateSlide={handleMutate}
      />
    );

    const splitBtn = screen.getByText(/Convert to Split Image/i);
    fireEvent.click(splitBtn);

    expect(handleMutate).toHaveBeenCalled();
    const mutatedSlide = handleMutate.mock.calls[0][0];
    expect(mutatedSlide.layoutType).toBe('image-split');
  });

  it('triggers onMutateSlide when concise chip is clicked (6x6 rule)', () => {
    const handleMutate = vi.fn();
    render(
      <InSlidePromptCopilot
        currentSlide={mockSlide}
        deckId="deck-123"
        onMutateSlide={handleMutate}
      />
    );

    const conciseBtn = screen.getByText(/Make More Concise/i);
    fireEvent.click(conciseBtn);

    expect(handleMutate).toHaveBeenCalled();
  });

  it('submits typed prompt on Enter key or button click', async () => {
    const handleMutate = vi.fn();
    render(
      <InSlidePromptCopilot
        currentSlide={mockSlide}
        deckId="deck-123"
        onMutateSlide={handleMutate}
      />
    );

    const input = screen.getByPlaceholderText(/Ask AI to mutate this slide/i);
    fireEvent.change(input, { target: { value: 'Highlight as big metric' } });

    const applyBtn = screen.getByRole('button', { name: /Submit slide mutation prompt/i });
    fireEvent.click(applyBtn);

    // Prompt router will process client-side
    await waitFor(() => {
      expect(handleMutate).toHaveBeenCalled();
    });
  });
});
