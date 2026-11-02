// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import Step04Delivery from '../Step04Delivery';
import { composeDeckFromPlan } from '../../gamma/composer';

describe('Step 04: Rehearse', () => {
  it('opens the player in presenter view with the talk length as the pace guide', () => {
    const deck = composeDeckFromPlan({ title: 'Decoders', keyMessage: 'They keep up.', talkMinutes: 5, slideCount: 5 });
    render(<Step04Delivery deck={deck} onPrevStep={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Rehearse (5 min)' }));
    expect(screen.getByText(/Presenter Mode/i)).toBeInTheDocument();
    expect(screen.getByTestId('rehearsal-pace')).toHaveTextContent('About 1:00 a slide');
  });
});
