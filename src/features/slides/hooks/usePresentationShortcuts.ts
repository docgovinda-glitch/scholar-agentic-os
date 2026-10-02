import { useEffect, useCallback, useState } from 'react';

export interface UsePresentationShortcutsOptions {
  slideCount: number;
  activeSlideIndex: number;
  onNextSlide: () => void;
  onPrevSlide: () => void;
  onFirstSlide?: () => void;
  onLastSlide?: () => void;
  onToggleFullscreen?: () => void;
  onTogglePresenter?: () => void;
  onExitFullscreen?: () => void;
  enabled?: boolean;
}

/**
 * Backward compatibility alias
 */
export type UseKeynoteShortcutsOptions = UsePresentationShortcutsOptions;

/**
 * usePresentationShortcuts:
 * Global keyboard event listener for presentation and stage delivery control.
 *
 * Supported key bindings:
 * - ArrowRight / Space / PageDown: Next slide
 * - ArrowLeft / PageUp: Previous slide
 * - Home: First slide
 * - End: Last slide
 * - F / f: Toggle browser Fullscreen API
 * - P / p: Toggle Presenter View drawer
 * - Escape: Exit fullscreen mode
 *
 * Strict input isolation: Keystrokes are ignored when typing inside
 * <input>, <textarea>, <select>, or contenteditable elements.
 */
export function usePresentationShortcuts({
  slideCount,
  activeSlideIndex,
  onNextSlide,
  onPrevSlide,
  onFirstSlide,
  onLastSlide,
  onToggleFullscreen,
  onTogglePresenter,
  onExitFullscreen,
  enabled = true,
}: UsePresentationShortcutsOptions) {
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() => {
    if (typeof document !== 'undefined') {
      return Boolean(document.fullscreenElement);
    }
    return false;
  });

  const toggleFullscreen = useCallback(async () => {
    if (typeof document === 'undefined') return;

    try {
      if (!document.fullscreenElement) {
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
          setIsFullscreen(true);
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
          setIsFullscreen(false);
        }
      }
      onToggleFullscreen?.();
    } catch (err) {
      // User gesture restrictions or test environment limitations
      console.warn('Fullscreen request failed:', err);
    }
  }, [onToggleFullscreen]);

  // Sync state with native browser fullscreen changes (e.g. Esc pressed natively)
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const handleFullscreenChange = () => {
      const active = Boolean(document.fullscreenElement);
      setIsFullscreen(active);
      if (!active && onExitFullscreen) {
        onExitFullscreen();
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [onExitFullscreen]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore keystrokes when typing inside inputs, textareas, selects, or editable containers
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          Boolean((target as any).isContentEditable) ||
          (typeof (target as any).getAttribute === 'function' &&
            (target as any).getAttribute('contenteditable') === 'true'))
      ) {
        return;
      }

      switch (e.key) {
        case 'ArrowRight':
        case ' ':
        case 'PageDown':
          e.preventDefault();
          onNextSlide();
          break;

        case 'ArrowLeft':
        case 'PageUp':
          e.preventDefault();
          onPrevSlide();
          break;

        case 'Home':
          e.preventDefault();
          onFirstSlide?.();
          break;

        case 'End':
          e.preventDefault();
          onLastSlide?.();
          break;

        case 'f':
        case 'F':
          e.preventDefault();
          toggleFullscreen();
          break;

        case 'p':
        case 'P':
          e.preventDefault();
          onTogglePresenter?.();
          break;

        case 'Escape':
          if (isFullscreen) {
            e.preventDefault();
            toggleFullscreen();
          } else if (onExitFullscreen) {
            e.preventDefault();
            onExitFullscreen();
          }
          break;

        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    enabled,
    onNextSlide,
    onPrevSlide,
    onFirstSlide,
    onLastSlide,
    onTogglePresenter,
    onExitFullscreen,
    toggleFullscreen,
    isFullscreen,
  ]);

  return {
    isFullscreen,
    toggleFullscreen,
  };
}

/**
 * Backward compatibility alias
 */
export const useKeynoteShortcuts = usePresentationShortcuts;
