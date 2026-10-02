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
});
