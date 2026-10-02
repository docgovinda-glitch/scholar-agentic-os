// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePresentationShortcuts } from '../usePresentationShortcuts';

describe('usePresentationShortcuts', () => {
  it('calls onNextSlide when ArrowRight, Space, or PageDown is pressed', () => {
    const onNextSlide = vi.fn();
    const onPrevSlide = vi.fn();

    renderHook(() =>
      usePresentationShortcuts({
        slideCount: 5,
        activeSlideIndex: 0,
        onNextSlide,
        onPrevSlide,
      })
    );

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(onNextSlide).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    expect(onNextSlide).toHaveBeenCalledTimes(2);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown' }));
    expect(onNextSlide).toHaveBeenCalledTimes(3);

    expect(onPrevSlide).not.toHaveBeenCalled();
  });

  it('calls onPrevSlide when ArrowLeft or PageUp is pressed', () => {
    const onNextSlide = vi.fn();
    const onPrevSlide = vi.fn();

    renderHook(() =>
      usePresentationShortcuts({
        slideCount: 5,
        activeSlideIndex: 2,
        onNextSlide,
        onPrevSlide,
      })
    );

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    expect(onPrevSlide).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageUp' }));
    expect(onPrevSlide).toHaveBeenCalledTimes(2);

    expect(onNextSlide).not.toHaveBeenCalled();
  });

  it('calls onFirstSlide on Home and onLastSlide on End', () => {
    const onFirstSlide = vi.fn();
    const onLastSlide = vi.fn();

    renderHook(() =>
      usePresentationShortcuts({
        slideCount: 5,
        activeSlideIndex: 2,
        onNextSlide: vi.fn(),
        onPrevSlide: vi.fn(),
        onFirstSlide,
        onLastSlide,
      })
    );

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' }));
    expect(onFirstSlide).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'End' }));
    expect(onLastSlide).toHaveBeenCalledTimes(1);
  });

  it('calls onTogglePresenter on key P', () => {
    const onTogglePresenter = vi.fn();

    renderHook(() =>
      usePresentationShortcuts({
        slideCount: 5,
        activeSlideIndex: 0,
        onNextSlide: vi.fn(),
        onPrevSlide: vi.fn(),
        onTogglePresenter,
      })
    );

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p' }));
    expect(onTogglePresenter).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'P' }));
    expect(onTogglePresenter).toHaveBeenCalledTimes(2);
  });

  it('isolates input typing: does not trigger shortcuts when target is an input or textarea', () => {
    const onNextSlide = vi.fn();

    renderHook(() =>
      usePresentationShortcuts({
        slideCount: 5,
        activeSlideIndex: 0,
        onNextSlide,
        onPrevSlide: vi.fn(),
      })
    );

    const input = document.createElement('input');
    document.body.appendChild(input);

    const event = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true });
    Object.defineProperty(event, 'target', { value: input, enumerable: true });

    window.dispatchEvent(event);
    expect(onNextSlide).not.toHaveBeenCalled();

    document.body.removeChild(input);
  });
});
