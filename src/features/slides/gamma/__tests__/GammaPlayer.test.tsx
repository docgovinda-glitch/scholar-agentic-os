// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import GammaPlayer from '../GammaPlayer';
import { composeDeckFromText } from '../composer';

const deck = composeDeckFromText(
  `# Remote work and housing
Remote work moved demand outward.
## Evidence
City rents fell 10% while suburban rents rose 7%.
## Method
First, we collected listings. Then we measured jobs. Finally, we fitted a model.`,
  { slideCount: 5 },
);
deck.slides[1] = { ...deck.slides[1], speakerNotes: 'Say the source as you give each number.' };

describe('GammaPlayer (full-screen presenter)', () => {
  it('starts in audience mode at the requested slide and moves with the keyboard', () => {
    render(<GammaPlayer deck={deck} initialSlideIndex={1} onClose={vi.fn()} />);
    expect(screen.getByTestId('live-slide-player')).toBeInTheDocument();
    expect(screen.getByText(/Audience Mode/i)).toBeInTheDocument();
    expect(screen.getAllByText('2 / 3').length).toBeGreaterThan(0);

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getAllByText('3 / 3').length).toBeGreaterThan(0);
    fireEvent.keyDown(window, { key: 'ArrowRight' }); // stays on the last card
    expect(screen.getAllByText('3 / 3').length).toBeGreaterThan(0);
    fireEvent.keyDown(window, { key: 'Home' });
    expect(screen.getAllByText('1 / 3').length).toBeGreaterThan(0);
  });

  it('shows speaker notes and the next card in presenter mode (N)', () => {
    render(<GammaPlayer deck={deck} initialSlideIndex={1} onClose={vi.fn()} />);
    fireEvent.keyDown(window, { key: 'n' });
    expect(screen.getByText(/Presenter Mode/i)).toBeInTheDocument();
    expect(screen.getByText('Say the source as you give each number.')).toBeInTheDocument();
    expect(screen.getByText(/^Next$/i)).toBeInTheDocument();
  });

  it('exits from the control bar and with Escape', () => {
    const onClose = vi.fn();
    const { unmount } = render(<GammaPlayer deck={deck} onClose={onClose} />);
    fireEvent.click(screen.getByTitle(/Exit Presentation/i));
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
    render(<GammaPlayer deck={deck} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('copes with an empty deck', () => {
    render(<GammaPlayer deck={{ ...deck, slides: [] }} onClose={vi.fn()} />);
    expect(screen.getByText(/no slides yet/i)).toBeInTheDocument();
  });
});
