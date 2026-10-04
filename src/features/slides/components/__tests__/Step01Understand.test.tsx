// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import React from 'react';
import Step01Understand from '../Step01Understand';
import type { SlideDeck } from '../../types/slides';

const emptyDeck: SlideDeck = {
  id: 'deck-empty',
  title: 'Untitled Presentation',
  slides: [],
  activeSlideIndex: 0,
};

const zapposDeck: SlideDeck = {
  id: 'deck-zappos',
  title: 'MN6094NI Developing Breakthrough Leadership',
  topic: 'Why Zappos Pays New Hires $2,000 to Quit',
  slides: [
    {
      id: 'slide-1',
      order: 1,
      actionHeadline: 'Why Zappos Pays New Hires $2,000 to Quit',
      summary: 'Analyzes how financial exit bonuses filter for genuine cultural alignment over short-term monetary motivation.',
      layoutType: 'metric-focus',
      framework: 'Standard-Narrative',
      frameworkPhase: 'Action Hook',
      blocks: [],
      speakerNotes: 'Slide 1: Why Zappos Pays New Hires $2,000 to Quit. Explain context and implications.',
    },
    {
      id: 'slide-2',
      order: 2,
      actionHeadline: "Schein's 3 Levels: Artifacts, Espoused Values & Basic Assumptions",
      summary: 'Deconstructs workplace culture across tangible physical symbols, declared philosophies, and unconscious beliefs.',
      layoutType: 'two-column',
      framework: 'Standard-Narrative',
      frameworkPhase: 'Theoretical Foundations',
      blocks: [],
      speakerNotes: "Slide 2: Schein's 3 Levels. Deconstructs visible artifacts, declared philosophies, and unconscious beliefs.",
    },
    {
      id: 'slide-3',
      order: 3,
      actionHeadline: 'The Limits of Artifacts: Why Changing Perks Fails to Shift Culture',
      summary: 'Evaluates why cosmetic changes like open offices and dress codes produce superficial compliance rather than core behavioral shifts.',
      layoutType: 'two-column',
      framework: 'Standard-Narrative',
      frameworkPhase: 'Intervention Analysis',
      blocks: [],
      speakerNotes: 'Slide 3: Evaluates why cosmetic changes produce superficial compliance.',
    },
    {
      id: 'slide-4',
      order: 4,
      actionHeadline: 'Leadership Intervention: Targeting Values and Habits to Shift Assumptions',
      summary: 'Assesses which cultural tier leaders must engage first to facilitate authentic, enduring organizational change.',
      layoutType: 'bullets',
      framework: 'Standard-Narrative',
      frameworkPhase: 'Leadership Levers',
      blocks: [],
      speakerNotes: 'Slide 4: Assesses which cultural tier leaders must engage first.',
    },
    {
      id: 'slide-5',
      order: 5,
      actionHeadline: 'Assessing Organizational Culture in Candidate Job Interviews',
      summary: 'Provides a diagnostic framework for candidates to observe workplace artifacts and probe beneath scripted corporate rhetoric.',
      layoutType: 'two-column',
      framework: 'Standard-Narrative',
      frameworkPhase: 'Practical Application',
      blocks: [],
      speakerNotes: 'Slide 5: Diagnostic framework for candidate job interviews.',
    },
  ],
  activeSlideIndex: 0,
};

describe('Step01Understand (Zero-Ghost Rule, Scope Cards & Presentation Style)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('enforces the Zero-Ghost rule: renders clean dashed empty state when no slides exist', () => {
    render(
      <Step01Understand
        deck={emptyDeck}
        onUpdateDeck={vi.fn()}
        onNextStep={vi.fn()}
      />
    );

    // Empty state container must be present
    expect(screen.getByTestId('zero-ghost-outline-empty-state')).toBeInTheDocument();
    expect(
      screen.getByText(
        /Ready to outline your presentation\. Enter a topic or upload your assignment brief above to generate your slides\./i
      )
    ).toBeInTheDocument();

    // Outline section must NOT be rendered
    expect(screen.queryByTestId('generated-outline-section')).not.toBeInTheDocument();

    // Purge check: Zero occurrences of "Presentation Takeaway"
    expect(screen.queryByText(/Presentation Takeaway/i)).not.toBeInTheDocument();
  });

  it('renders side-by-side Green and Yellow scope cards and SlideOutlinePillCards when slides exist', () => {
    render(
      <Step01Understand
        deck={zapposDeck}
        onUpdateDeck={vi.fn()}
        onNextStep={vi.fn()}
      />
    );

    // Green Card: What This Presentation Covers
    expect(screen.getByTestId('presentation-scope-covers-card')).toBeInTheDocument();
    expect(screen.getByText(/What This Presentation Covers/i)).toBeInTheDocument();
    expect(screen.getByText(/Key Points · Editable/i)).toBeInTheDocument();

    // Plain-English bullet content for Zappos/Schein
    expect(
      screen.getByText(/The real strategic reason Zappos pays people to leave during training\./i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/How Schein's 3 levels explain visible perks vs\. invisible company values\./i)
    ).toBeInTheDocument();

    // Yellow Card: What to Avoid
    expect(screen.getByTestId('presentation-scope-avoids-card')).toBeInTheDocument();
    expect(screen.getByText(/What to Avoid \(Out of Scope\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Rules · Editable/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Do not include classroom instructions, team pairings, or tutorial time limits\./i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Avoid long paragraphs of text—enforce clean 6x6 bullet phrasing\./i)
    ).toBeInTheDocument();

    // Slide Outline Pill Cards
    const pillCard1 = screen.getByTestId('slide-outline-pill-card-1');
    expect(pillCard1).toBeInTheDocument();
    expect(pillCard1).toHaveTextContent('Why Zappos Pays New Hires $2,000 to Quit');
    expect(pillCard1).toHaveTextContent(
      /Analyzes how financial exit bonuses filter for genuine cultural alignment/i
    );

    expect(screen.getByTestId('slide-outline-pill-card-2')).toBeInTheDocument();
    expect(screen.getByText("Schein's 3 Levels: Artifacts, Espoused Values & Basic Assumptions")).toBeInTheDocument();

    // Stepper button
    expect(screen.getByRole('button', { name: /Proceed to Design/i })).toBeInTheDocument();

    // Purge check: Zero occurrences of "Presentation Takeaway"
    expect(screen.queryByText(/Presentation Takeaway/i)).not.toBeInTheDocument();
  });

  it('allows adding and removing scope points in the Green and Yellow cards', () => {
    render(
      <Step01Understand
        deck={zapposDeck}
        onUpdateDeck={vi.fn()}
        onNextStep={vi.fn()}
      />
    );

    // Remove first cover point
    const removeFirstCoverBtn = screen.getByLabelText('Remove point 1');
    fireEvent.click(removeFirstCoverBtn);

    expect(
      screen.queryByText(/The real strategic reason Zappos pays people to leave during training\./i)
    ).not.toBeInTheDocument();

    // Add new cover point
    const addCoverBtn = screen.getByRole('button', { name: /Add Key Point/i });
    fireEvent.click(addCoverBtn);

    const input = screen.getByPlaceholderText(/Add a key focus point\.\.\./i);
    fireEvent.change(input, { target: { value: 'New diagnostic benchmark for corporate onboarding' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(
      screen.getByText('New diagnostic benchmark for corporate onboarding')
    ).toBeInTheDocument();

    // Remove first avoid rule
    const removeFirstAvoidBtn = screen.getByLabelText('Remove rule 1');
    fireEvent.click(removeFirstAvoidBtn);

    expect(
      screen.queryByText(/Do not include classroom instructions, team pairings, or tutorial time limits\./i)
    ).not.toBeInTheDocument();
  });

  it('binds Presentation Style dropdown and generates dynamic question-to-slide outline', () => {
    const handleUpdate = vi.fn();
    render(
      <Step01Understand
        deck={emptyDeck}
        onUpdateDeck={handleUpdate}
        onNextStep={vi.fn()}
      />
    );

    // Verify presentation style options include executive-pitch and case-study
    const styleSelect = screen.getByLabelText(/Presentation Style/i);
    expect(styleSelect).toBeInTheDocument();

    fireEvent.change(styleSelect, { target: { value: 'executive-pitch' } });

    // Enter Zappos topic
    const topicTextarea = screen.getByLabelText(/Presentation Topic/i);
    fireEvent.change(topicTextarea, {
      target: { value: 'Why Zappos Pays New Hires $2,000 to Quit (MN6094NI Leadership Tutorial)' },
    });

    // Click Save & Generate Outline
    const generateBtn = screen.getByLabelText(/Save & Generate Outline/i);
    fireEvent.click(generateBtn);

    expect(handleUpdate).toHaveBeenCalled();
    const generated = handleUpdate.mock.calls[0][0] as SlideDeck;

    expect(generated.slides).toHaveLength(5);
    expect(generated.slides[0].actionHeadline).toBe('Why Zappos Pays New Hires $2,000 to Quit');
    expect(generated.slides[1].actionHeadline).toBe("Schein's 3 Levels: Artifacts, Espoused Values & Basic Assumptions");
    expect(generated.slides[2].actionHeadline).toBe('The Limits of Artifacts: Why Changing Perks Fails to Shift Culture');
    expect(generated.slides[3].actionHeadline).toBe(
      'Leadership Intervention: Targeting Values and Habits to Shift Assumptions'
    );
    expect(generated.slides[4].actionHeadline).toBe(
      'Assessing Organizational Culture in Candidate Job Interviews'
    );

    // Verify 1-sentence summaries are present
    expect(generated.slides[0].summary).toBeDefined();
    expect(generated.slides[0].summary).toContain('exit bonuses');
  });
});
