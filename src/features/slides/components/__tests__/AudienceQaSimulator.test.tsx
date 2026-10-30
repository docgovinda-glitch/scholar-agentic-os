// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import React from 'react';
import AudienceQaSimulator from '../AudienceQaSimulator';
import type { SlideDeck } from '../../types/slides';

describe('AudienceQaSimulator', () => {
  const mockDeck: SlideDeck = {
    id: 'deck-qa-test',
    title: 'Autonomous Verification Protocols',
    topic: 'Autonomous Verification Protocols',
    framework: 'Standard-Narrative',
    slides: [
      {
        id: 'slide-1',
        order: 1,
        actionHeadline: 'Empirical Lift: 4.2x Faster Turnaround',
        blocks: [],
        speakerNotes: 'Slide 1 notes',
        framework: 'Standard-Narrative',
      },
      {
        id: 'slide-2',
        order: 2,
        actionHeadline: 'Methodological Triangulation Protocol',
        blocks: [],
        speakerNotes: 'Slide 2 notes',
        framework: 'Standard-Narrative',
      },
    ],
    activeSlideIndex: 0,
  };

  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        questions: [
          {
            id: 'qa-api-1',
            persona: 'Hostile Defense Referee',
            difficulty: 'adversarial',
            targetSlideNumber: 2,
            question: 'How do you justify claiming zero hallucination without out-of-domain benchmarks?',
            intent: 'Testing candidate epistemic limits and out-of-domain robustness.',
            suggestedAnswer: 'We tested across 5,000 double-blind clinical trials with frozen test partitions.',
            modelRebuttalPoints: [
              'Zero hallucination is strictly bounded to the verified Knowledge Vault index.',
              'Out-of-distribution queries trigger an explicit reject option with confidence threshold 0.85.',
            ],
          },
        ],
      }),
    });
  });

  it('renders the Audience Q&A Simulator empty, with no demo questions', () => {
    const handleClose = vi.fn();
    render(
      <AudienceQaSimulator
        projectId="proj-qa-1"
        deck={mockDeck}
        isOpen={true}
        onClose={handleClose}
      />
    );

    expect(screen.getByTestId('audience-qa-simulator-modal')).toBeInTheDocument();
    expect(screen.getByText(/Audience Q&A & Defense Simulator/i)).toBeInTheDocument();
    expect(screen.getByText(/AI Referee Engine/i)).toBeInTheDocument();
    // Opens empty: no demo questions (PRODUCT_AUDIT P0-11).
    expect(screen.getByTestId('qa-empty')).toBeInTheDocument();
    expect(screen.queryByText(/Methodological Referee|74%|p > 0\.40/i)).not.toBeInTheDocument();

    // Verify difficulty selector has moderate, rigorous, adversarial options
    const difficultySelect = screen.getByLabelText(/Referee Rigor/i);
    expect(difficultySelect).toBeInTheDocument();
    expect(difficultySelect).toHaveValue('rigorous');

    // Close on Done Rehearsing
    const doneBtn = screen.getByRole('button', { name: /Done Rehearsing/i });
    fireEvent.click(doneBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('simulates referee questions via POST /qa-simulate with difficulty selection', async () => {
    render(
      <AudienceQaSimulator
        projectId="proj-qa-1"
        deck={mockDeck}
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    // Change difficulty to Adversarial
    const difficultySelect = screen.getByLabelText(/Referee Rigor/i);
    fireEvent.change(difficultySelect, { target: { value: 'adversarial' } });

    // Click Generate Audience Questions
    const runBtn = screen.getByTestId('run-qa-simulation-btn');
    fireEvent.click(runBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/projects/proj-qa-1/presentation/qa-simulate'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"difficulty":"adversarial"'),
        })
      );
    });

    // Question from API should appear
    expect(
      await screen.findByText(/How do you justify claiming zero hallucination without out-of-domain benchmarks\?/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/Hostile Defense Referee/i)).toBeInTheDocument();
  });

  it('toggles model defense arguments and permits typing practice responses', async () => {
    // Uses the user's saved questions; the demo questions this test relied on were removed (P0-11).
    render(
      <AudienceQaSimulator
        projectId="proj-qa-1"
        deck={mockDeck}
        isOpen={true}
        onClose={vi.fn()}
        savedQuestions={[
          {
            id: 'qa-saved-1',
            persona: 'Methodologist',
            difficulty: 'rigorous',
            targetSlideNumber: 2,
            question: 'Why this sampling frame?',
            intent: 'Scope',
            suggestedAnswer: 'Because the population is defined by enrolment.',
            modelRebuttalPoints: ['State the inclusion rule.'],
          },
        ]}
      />
    );

    const textarea = screen.getAllByPlaceholderText(/Type or dictate your verbal response/i)[0];
    fireEvent.change(textarea, { target: { value: 'We sampled every enrolled student.' } });
    expect(textarea).toHaveValue('We sampled every enrolled student.');

    fireEvent.click(screen.getAllByRole('button', { name: /Reveal Model Defense & Rebuttal Points/i })[0]);
    expect(screen.getByText(/Candidate Model Response:/i)).toBeInTheDocument();
    expect(screen.getByText(/State the inclusion rule\./i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Hide Model Defense Arguments/i }));
    expect(screen.queryByText(/Candidate Model Response:/i)).not.toBeInTheDocument();
  });

  it('shows why no questions were generated instead of stand-in questions', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'Connect an AI provider (your own key or a local model) in AI Access to run this.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    render(<AudienceQaSimulator projectId="proj-qa-1" deck={mockDeck} isOpen={true} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('run-qa-simulation-btn'));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Connect an AI provider/i);
    expect(screen.queryByText(/cryptographic hashes|boundary conditions limit/i)).not.toBeInTheDocument();
  });
});
