import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { SlideCard } from '../types/slides';
import { getCardContent, resolveLayout } from './content';
import { CANVAS_H, CANVAS_W, computeCardGeometry, type CardElement, type CardGeometry, type TextEl } from './geometry';
import { WEB_FONTS, type DeckTheme } from './theme';
import { resetMeasureCache } from './measure';

/* ------------------------------------------------------------------------ */
/* Web-font readiness                                                        */
/* ------------------------------------------------------------------------ */

let fontsVersion = 0;
const fontListeners = new Set<() => void>();
let fontsHooked = false;

function hookFonts() {
  if (fontsHooked || typeof document === 'undefined' || !document.fonts) return;
  fontsHooked = true;
  const bump = () => {
    resetMeasureCache();
    fontsVersion += 1;
    fontListeners.forEach((fn) => fn());
  };
  document.fonts.ready.then(bump).catch(() => {});
  document.fonts.addEventListener?.('loadingdone', bump);
}

/**
 * Re-renders when web fonts finish loading so geometry is re-measured with
 * the real typeface instead of the fallback.
 */
export function useFontsVersion(): number {
  const [v, setV] = useState(fontsVersion);
  useEffect(() => {
    hookFonts();
    const fn = () => setV(fontsVersion);
    fontListeners.add(fn);
    return () => {
      fontListeners.delete(fn);
    };
  }, []);
  return v;
}

/* ------------------------------------------------------------------------ */
/* Scaled 16:9 stage                                                         */
/* ------------------------------------------------------------------------ */

/**
 * Renders a fixed 1280×720 stage scaled to the container's width, so a
 * thumbnail, the editor, the presenter and a theme preview are pixel-identical
 * at any size.
 */
function useStageScale(fixedScale?: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(fixedScale ?? 0);

  useLayoutEffect(() => {
    if (fixedScale !== undefined) return;
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      if (w > 0) setScale(w / CANVAS_W);
    };
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fixedScale]);

  return { ref, scale: fixedScale ?? scale };
}

/* ------------------------------------------------------------------------ */
/* Element rendering                                                         */
/* ------------------------------------------------------------------------ */

interface EditableProps {
  el: TextEl;
  editable: boolean;
  accent: string;
  onEdit?: (path: string, value: string) => void;
}

function TextBox({ el, editable, accent, onEdit }: EditableProps) {
  const canEdit = editable && !!el.path && !!onEdit;
  const style: React.CSSProperties = {
    position: 'absolute',
    left: el.x,
    top: el.y,
    width: el.w,
    minHeight: el.h,
    fontFamily: WEB_FONTS[el.font],
    fontSize: el.size,
    fontWeight: el.weight,
    fontStyle: el.italic ? 'italic' : undefined,
    lineHeight: el.lineHeight,
    letterSpacing: el.letterSpacing ? `${el.letterSpacing}px` : undefined,
    textTransform: el.uppercase ? 'uppercase' : undefined,
    color: el.color,
    textAlign: el.align,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: el.valign === 'middle' ? 'center' : el.valign === 'bottom' ? 'flex-end' : 'flex-start',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
    margin: 0,
    ['--gamma-ring' as string]: `${accent}55`,
  };

  if (!canEdit) {
    return (
      <div style={style} data-path={el.path}>
        {el.text}
      </div>
    );
  }

  return (
    <div
      style={{ ...style, cursor: 'text', borderRadius: 6 }}
      className="outline-none transition-shadow hover:shadow-[0_0_0_2px_var(--gamma-ring)] focus:shadow-[0_0_0_2px_var(--gamma-ring)]"
      contentEditable
      suppressContentEditableWarning
      spellCheck
      role="textbox"
      aria-label={`Edit ${el.path}`}
      data-path={el.path}
      onPaste={(e) => {
        e.preventDefault();
        const plain = e.clipboardData.getData('text/plain');
        document.execCommand('insertText', false, plain);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          (e.currentTarget as HTMLDivElement).blur();
        }
        if (e.key === 'Escape') {
          (e.currentTarget as HTMLDivElement).textContent = el.text;
          (e.currentTarget as HTMLDivElement).blur();
        }
        e.stopPropagation();
      }}
      onBlur={(e) => {
        const next = (e.currentTarget.textContent || '').replace(/\s+/g, ' ').trim();
        if (next !== el.text && el.path) onEdit?.(el.path, next);
      }}
    >
      {el.text}
    </div>
  );
}

function ElementView({ el, editable, accent, onEdit }: { el: CardElement; editable: boolean; accent: string; onEdit?: (p: string, v: string) => void }) {
  switch (el.kind) {
    case 'text':
      return <TextBox el={el} editable={editable} accent={accent} onEdit={onEdit} />;
    case 'rect':
      return (
        <div
          aria-hidden
          style={{
            position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h, background: el.fill ?? 'transparent',
            borderRadius: el.radius, boxShadow: el.stroke ? `inset 0 0 0 ${el.strokeWidth ?? 1}px ${el.stroke}` : undefined,
          }}
        />
      );
    case 'ellipse':
      return (
        <div
          aria-hidden
          style={{
            position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h, background: el.fill ?? 'transparent',
            borderRadius: '50%', boxShadow: el.stroke ? `inset 0 0 0 ${el.strokeWidth ?? 1}px ${el.stroke}` : undefined,
          }}
        />
      );
    case 'line': {
      const horizontal = el.y1 === el.y2;
      return (
        <div
          aria-hidden
          style={{
            position: 'absolute', left: Math.min(el.x1, el.x2), top: Math.min(el.y1, el.y2) - (horizontal ? el.width / 2 : 0),
            width: horizontal ? Math.abs(el.x2 - el.x1) : el.width, height: horizontal ? el.width : Math.abs(el.y2 - el.y1),
            background: el.color,
          }}
        />
      );
    }
    case 'image':
      return (
        <img
          src={el.url}
          alt={el.alt || ''}
          draggable={false}
          style={{ position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h, objectFit: 'cover', borderRadius: el.radius }}
        />
      );
    default:
      return null;
  }
}

/* ------------------------------------------------------------------------ */
/* Public components                                                         */
/* ------------------------------------------------------------------------ */

export interface GammaCardProps {
  geometry: CardGeometry;
  theme: DeckTheme;
  editable?: boolean;
  onEdit?: (path: string, value: string) => void;
  /** Force a scale instead of fitting the container width. */
  scale?: number;
  className?: string;
  rounded?: boolean;
  shadow?: boolean;
  'data-testid'?: string;
}

export function GammaCard({ geometry, theme, editable = false, onEdit, scale: fixedScale, className, rounded = true, shadow = false, ...rest }: GammaCardProps) {
  const { ref, scale } = useStageScale(fixedScale);
  return (
    <div
      ref={ref}
      className={className}
      data-testid={rest['data-testid']}
      data-layout={geometry.layout}
      style={{
        position: 'relative',
        width: fixedScale !== undefined ? CANVAS_W * fixedScale : '100%',
        aspectRatio: '16 / 9',
        overflow: 'hidden',
        borderRadius: rounded ? Math.max(6, 18 * (scale || 1)) : 0,
        background: geometry.background,
        boxShadow: shadow
          ? theme.mode === 'dark'
            ? '0 1px 0 rgba(255,255,255,0.04) inset, 0 24px 48px -24px rgba(0,0,0,0.6)'
            : '0 1px 2px rgba(23,23,23,0.04), 0 24px 48px -28px rgba(23,23,23,0.22)'
          : undefined,
        outline: `1px solid ${theme.border}`,
        outlineOffset: -1,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: CANVAS_W,
          height: CANVAS_H,
          transform: `scale(${scale || 0.0001})`,
          transformOrigin: 'top left',
          visibility: scale ? 'visible' : 'hidden',
        }}
      >
        {geometry.elements.map((el, i) => (
          // Text is part of the key so an edited contentEditable box remounts
          // with React-owned DOM instead of the user-mutated nodes.
          <ElementView key={`${i}-${el.kind}-${el.kind === 'text' ? `${el.path ?? ''}:${el.text}` : ''}`} el={el} editable={editable} accent={theme.accent} onEdit={onEdit} />
        ))}
      </div>
    </div>
  );
}

export interface GammaSlideProps extends Omit<GammaCardProps, 'geometry'> {
  slide: SlideCard;
  index: number;
  showNumber?: boolean;
}

/** Convenience wrapper: slide + theme → rendered card. */
export function GammaSlide({ slide, index, theme, showNumber = true, ...rest }: GammaSlideProps) {
  const fonts = useFontsVersion();
  const geometry = useMemo(
    () => computeCardGeometry(getCardContent(slide), resolveLayout(slide, index), theme, showNumber && index > 0 ? index + 1 : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `fonts` forces re-measurement after web fonts load
    [slide, index, theme, showNumber, fonts],
  );
  return <GammaCard geometry={geometry} theme={theme} {...rest} />;
}

export default GammaSlide;
