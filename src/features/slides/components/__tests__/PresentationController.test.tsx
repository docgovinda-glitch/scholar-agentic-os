// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import PresentationController from '../PresentationController';
import type { SlideCard } from '../../types/slides';

describe('PresentationController', () => {
  const mockSlide: SlideCard = {
    id: 'slide-1',
    order: 1,
    actionHeadline: 'Triangulated Survey Data Validates 14% Retention Drop',
    blocks: [],
    speakerNotes: 'Speak with conviction about first-year cohort persistence and methodology.',
    framework: 'SCR',
    methodologyNote: 'Verified against Student Record Information System (SRIS 2026).',
  };

  it('renders slide index counter and navigation controls', () => {
    const onNext = vi.fn();
    const onPrev = vi.fn();
    const onFirst = vi.fn();
    const onLast = vi.fn();

    render(
      <PresentationController
        currentSlideIndex={1}
        totalSlides={5}
        activeSlide={mockSlide}
        viewMode="stage"
        onViewModeChange={vi.fn()}
        onNextSlide={onNext}
        onPrevSlide={onPrev}
        onFirstSlide={onFirst}
        onLastSlide={onLast}
        isFullscreen={false}
        onToggleFullscreen={vi.fn()}
        isPresenterOpen={false}
        onTogglePresenter={vi.fn()}
      />
    );

    expect(screen.getByText('2 / 5')).toBeInTheDocument();

    const nextBtn = screen.getByLabelText('Next slide');
    fireEvent.click(nextBtn);
    expect(onNext).toHaveBeenCalledTimes(1);

    const prevBtn = screen.getByLabelText('Previous slide');
    fireEvent.click(prevBtn);
    expect(onPrev).toHaveBeenCalledTimes(1);

    const firstBtn = screen.getByLabelText('First slide');
    fireEvent.click(firstBtn);
    expect(onFirst).toHaveBeenCalledTimes(1);

    const lastBtn = screen.getByLabelText('Last slide');
    fireEvent.click(lastBtn);
    expect(onLast).toHaveBeenCalledTimes(1);
  });

  it('renders rehearsal timer and resets on reset button click', () => {
    vi.useFakeTimers();

    render(
      <PresentationController
        currentSlideIndex={0}
        totalSlides={3}
        activeSlide={mockSlide}
        viewMode="stage"
        onViewModeChange={vi.fn()}
        onNextSlide={vi.fn()}
        onPrevSlide={vi.fn()}
        onFirstSlide={vi.fn()}
        onLastSlide={vi.fn()}
        isFullscreen={false}
        onToggleFullscreen={vi.fn()}
        isPresenterOpen={false}
        onTogglePresenter={vi.fn()}
      />
    );

    expect(screen.getByText(/00:00/)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByText(/00:03/)).toBeInTheDocument();

    const resetBtn = screen.getByTitle('Reset Timer');
    fireEvent.click(resetBtn);

    expect(screen.getByText(/00:00/)).toBeInTheDocument();

    vi.useRealTimers();
  });

  it('switches between Stage and Standalone leave-behind view modes', () => {
    const onViewModeChange = vi.fn();

    render(
      <PresentationController
        currentSlideIndex={0}
        totalSlides={3}
        activeSlide={mockSlide}
        viewMode="stage"
        onViewModeChange={onViewModeChange}
        onNextSlide={vi.fn()}
        onPrevSlide={vi.fn()}
        onFirstSlide={vi.fn()}
        onLastSlide={vi.fn()}
        isFullscreen={false}
        onToggleFullscreen={vi.fn()}
        isPresenterOpen={false}
        onTogglePresenter={vi.fn()}
      />
    );

    const leaveBehindBtn = screen.getByTitle(/Standalone Mode/i);
    fireEvent.click(leaveBehindBtn);
    expect(onViewModeChange).toHaveBeenCalledWith('standalone');

    const stageBtn = screen.getByTitle(/Stage Mode/i);
    fireEvent.click(stageBtn);
    expect(onViewModeChange).toHaveBeenCalledWith('stage');
  });

  it('toggles presenter notes drawer and displays speaker script and methodology note', () => {
    const onTogglePresenter = vi.fn();

    render(
      <PresentationController
        currentSlideIndex={0}
        totalSlides={3}
        activeSlide={mockSlide}
        viewMode="stage"
        onViewModeChange={vi.fn()}
        onNextSlide={vi.fn()}
        onPrevSlide={vi.fn()}
        onFirstSlide={vi.fn()}
        onLastSlide={vi.fn()}
        isFullscreen={false}
        onToggleFullscreen={vi.fn()}
        isPresenterOpen={true}
        onTogglePresenter={onTogglePresenter}
      />
    );

    expect(screen.getByTestId('presenter-notes-drawer')).toBeInTheDocument();
    expect(screen.getByText(/Speak with conviction about first-year cohort persistence/i)).toBeInTheDocument();
    expect(screen.getByText(/Verified against Student Record Information System/i)).toBeInTheDocument();

    const toggleBtn = screen.getByLabelText('Toggle speaker notes');
    fireEvent.click(toggleBtn);
    expect(onTogglePresenter).toHaveBeenCalledTimes(1);
  });

  it('triggers onToggleFullscreen when fullscreen button clicked', () => {
    const onToggleFullscreen = vi.fn();

    render(
      <PresentationController
        currentSlideIndex={0}
        totalSlides={3}
        activeSlide={mockSlide}
        viewMode="stage"
        onViewModeChange={vi.fn()}
        onNextSlide={vi.fn()}
        onPrevSlide={vi.fn()}
        onFirstSlide={vi.fn()}
        onLastSlide={vi.fn()}
        isFullscreen={false}
        onToggleFullscreen={onToggleFullscreen}
        isPresenterOpen={false}
        onTogglePresenter={vi.fn()}
      />
    );

    const fsBtn = screen.getByLabelText('Toggle fullscreen');
    fireEvent.click(fsBtn);
    expect(onToggleFullscreen).toHaveBeenCalledTimes(1);
  });
});
