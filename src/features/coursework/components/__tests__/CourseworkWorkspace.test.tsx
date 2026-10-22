// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import CourseworkWorkspace from '../CourseworkWorkspace';

describe('CourseworkWorkspace', () => {
  it('renders drafting header, live word count, and Present Presentation action pill with exact specification styling', () => {
    render(<CourseworkWorkspace />);

    expect(screen.getByText('Phase 03 · Drafting & Presentation Bridge')).toBeInTheDocument();
    expect(screen.getByText(/Words Synthesized/i)).toBeInTheDocument();

    const presBtn = screen.getByRole('button', { name: /Present Presentation/i });
    expect(presBtn).toBeInTheDocument();
    expect(presBtn.className).toContain('rounded-full');
    expect(presBtn.className).toContain('px-4');
    expect(presBtn.className).toContain('py-1.5');
    expect(presBtn.className).toContain('text-sm');
  });

  it('clicking Present Presentation action pill transitions to SlideCanvas without page reload', () => {
    render(<CourseworkWorkspace />);

    // Initially in drafting view
    expect(screen.queryByTestId('slide-canvas-viewport')).not.toBeInTheDocument();

    // Click Present Presentation action pill
    const presBtn = screen.getByRole('button', { name: /Present Presentation/i });
    fireEvent.click(presBtn);

    // Transitions to SlideCanvas
    expect(screen.getByTestId('slide-canvas-viewport')).toBeInTheDocument();
    expect(screen.getByTestId('slide-card-active')).toBeInTheDocument();
    expect(screen.getByTestId('presentation-controller')).toBeInTheDocument();

    // Verify converted content is present
    expect(screen.getAllByText(/84%/).length).toBeGreaterThan(0);

    // Click Back to exit presentation
    const backBtn = screen.getByTitle('Close Presentation View');
    fireEvent.click(backBtn);

    // Transitions back to drafting view without page reload
    expect(screen.queryByTestId('slide-canvas-viewport')).not.toBeInTheDocument();
    expect(screen.getByText('Phase 03 · Drafting & Presentation Bridge')).toBeInTheDocument();
  });

  it('editing coursework section content dynamically converts into updated slide presentation', () => {
    render(<CourseworkWorkspace />);

    // Update section 1 content
    const contentTextarea = screen.getByDisplayValue(/Standard generative models lack cryptographic provenance/);
    fireEvent.change(contentTextarea, {
      target: {
        value: 'Empirical analysis confirms 94.5% precision gain across multi-agent consensus protocols.',
      },
    });

    // Launch presentation
    const presBtn = screen.getByRole('button', { name: /Present Presentation/i });
    fireEvent.click(presBtn);

    expect(screen.getByTestId('slide-canvas-viewport')).toBeInTheDocument();
    expect(screen.getByText('94.5%')).toBeInTheDocument();
  });

  it('renders Minimal Mode by default with streamlined controls and toggles to Detailed Mode', () => {
    render(<CourseworkWorkspace initialMode="minimal" />);

    // Streamlined setup header and mode toggle
    expect(screen.getByText(/Streamlined Setup/i)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Minimal/i })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /Detailed/i })).toHaveAttribute('aria-checked', 'false');

    // Streamlined inputs are present
    expect(screen.getByLabelText('Topic')).toBeInTheDocument();
    expect(screen.getByLabelText('Assignment Type')).toBeInTheDocument();
    expect(screen.getByLabelText('Word Count')).toBeInTheDocument();
    expect(screen.getByLabelText('Citation Style')).toBeInTheDocument();

    // In Minimal Mode, detailed telemetry is hidden
    expect(screen.queryByText(/Live 4-Phase Atomic Lifecycle Stepper/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Academic Tone')).not.toBeInTheDocument();

    // Toggle to Detailed Mode
    fireEvent.click(screen.getByRole('radio', { name: /Detailed/i }));

    // Detailed Mode controls and telemetry appear
    expect(screen.getByText(/Comprehensive Architecture Controls/i)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Detailed/i })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText('Academic Tone')).toBeInTheDocument();
    expect(screen.getByLabelText('Custom Rubric')).toBeInTheDocument();
    expect(screen.getByText(/Live 4-Phase Atomic Lifecycle Stepper/i)).toBeInTheDocument();
    expect(screen.getByText(/Inter-section Overlap: 4.8% \(PASS <20%\)/i)).toBeInTheDocument();
    expect(screen.getByText(/OpenAlex: 14 Indexed Sources/i)).toBeInTheDocument();
    expect(screen.getByText(/Crossref: DOIs Verified/i)).toBeInTheDocument();
    expect(screen.getByText(/OT-01 Supervised Style Engine \(110-Paper Corpus Benchmark\)/i)).toBeInTheDocument();
  });

  it('auto-binds Academic Tone when Assignment Type changes, allowing manual override', () => {
    render(<CourseworkWorkspace initialMode="detailed" targetArchetype="essay" />);

    const typeSelect = screen.getByLabelText('Assignment Type');
    const toneSelect = screen.getByLabelText('Academic Tone') as HTMLSelectElement;

    // Default for essay is Formal Academic
    expect(toneSelect.value).toBe('Formal Academic');

    // Change to literature_review -> auto-binds to Critical
    fireEvent.change(typeSelect, { target: { value: 'literature_review' } });
    expect(toneSelect.value).toBe('Critical');

    // Change to policy_analysis -> auto-binds to Analytical
    fireEvent.change(typeSelect, { target: { value: 'policy_analysis' } });
    expect(toneSelect.value).toBe('Analytical');

    // Change to argumentative_essay -> auto-binds to Persuasive
    fireEvent.change(typeSelect, { target: { value: 'argumentative_essay' } });
    expect(toneSelect.value).toBe('Persuasive');

    // User can manually override tone
    fireEvent.change(toneSelect, { target: { value: 'Conversational Academic' } });
    expect(toneSelect.value).toBe('Conversational Academic');
  });
});

