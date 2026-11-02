// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import React from 'react';
import Step01Understand from '../Step01Understand';
import type { SlideDeck } from '../../types/slides';
import { getCardContent } from '../../gamma/content';

const emptyDeck: SlideDeck = { id: 'deck-t', title: 'Untitled Presentation', slides: [], activeSlideIndex: 0 };

function fillPlan() {
  fireEvent.change(screen.getByLabelText(/^Title/i), { target: { value: 'Real-time decoding' } });
  fireEvent.change(screen.getByLabelText(/Key message/i), { target: { value: 'Pipelined decoders keep up.' } });
  fireEvent.change(screen.getByLabelText('Talk length'), { target: { value: '5' } });
  fireEvent.click(screen.getByRole('button', { name: /Add Key Point/i }));
  fireEvent.change(screen.getByPlaceholderText(/Add a point you want to make/i), { target: { value: 'Software decoders fall behind' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
}

describe('Step 01: the talk plan', () => {
  afterEach(() => vi.restoreAllMocks());

  it('talk length suggests the slide count and shows time per slide', () => {
    render(<Step01Understand deck={emptyDeck} onUpdateDeck={vi.fn()} onNextStep={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Talk length'), { target: { value: '20' } });
    expect((screen.getByLabelText('Slide Count') as HTMLSelectElement).value).toBe('15');
    expect(screen.getByText('(about 1:15 each)')).toBeInTheDocument();
  });

  it("the starter outline uses the presenter's title, key message and points", () => {
    const update = vi.fn();
    render(<Step01Understand deck={emptyDeck} onUpdateDeck={update} onNextStep={vi.fn()} />);
    fillPlan();
    fireEvent.click(screen.getByRole('button', { name: 'Starter outline without AI' }));
    const deck = update.mock.calls.at(-1)![0] as SlideDeck;
    const cards = deck.slides.map(getCardContent);
    expect(deck.slides).toHaveLength(6);
    expect(cards[0]).toMatchObject({ headline: 'Real-time decoding', lede: 'Pipelined decoders keep up.' });
    expect(cards[1].headline).toBe('Software decoders fall behind');
    expect(cards.at(-1)!.headline).toBe('Pipelined decoders keep up.');
    expect(deck).toMatchObject({ talkMinutes: 5, keyMessage: 'Pipelined decoders keep up.', talkPoints: ['Software decoders fall behind'] });
  });

  it("Build slides with AI sends the plan and uses the AI's deck", async () => {
    const aiDeck = { id: 'deck-ai', title: 'Real-time decoding', activeSlideIndex: 0, slides: [{ id: 's1', order: 1, actionHeadline: 'From the AI', blocks: [] }] };
    const fetchSpy = vi.spyOn(window, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, generatedBy: 'ai-gateway', deck: aiDeck }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    const update = vi.fn();
    render(<Step01Understand projectId="proj-1" deck={emptyDeck} onUpdateDeck={update} onNextStep={vi.fn()} />);
    fillPlan();
    fireEvent.click(screen.getByRole('button', { name: /Build slides with AI/ }));
    await waitFor(() => expect(update).toHaveBeenCalled());
    const body = JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body));
    expect(body).toMatchObject({ title: 'Real-time decoding', keyMessage: 'Pipelined decoders keep up.', points: ['Software decoders fall behind'], durationMinutes: 5, slideCount: 6 });
    const deck = update.mock.calls.at(-1)![0] as SlideDeck;
    expect(deck.slides[0].actionHeadline).toBe('From the AI');
    expect(deck.talkMinutes).toBe(5);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('when no AI drafts it, says so and builds the starter outline from the plan', async () => {
    vi.spyOn(window, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: 'Missing or invalid authorization header' }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
    const update = vi.fn();
    render(<Step01Understand projectId="proj-1" deck={emptyDeck} onUpdateDeck={update} onNextStep={vi.fn()} />);
    fillPlan();
    fireEvent.click(screen.getByRole('button', { name: /Build slides with AI/ }));
    expect(await screen.findByRole('status')).toHaveTextContent('Sign in so your AI can draft the slides. This is a starter outline built from your plan.');
    const deck = update.mock.calls.at(-1)![0] as SlideDeck;
    expect(getCardContent(deck.slides[1]).headline).toBe('Software decoders fall behind');
  });
});
