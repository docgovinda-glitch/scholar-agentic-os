/**
 * Step 03 · Edit Slides — the Gamma-style card studio.
 *
 * Left: live thumbnail rail. Centre: the card itself, edited inline (click
 * any text). Above the card: one-click layout switching that reflows the same
 * content. Toolbar: theme switching and native .pptx export. Everything is
 * drawn by the shared gamma engine, so what you see here is what Present and
 * PowerPoint show.
 */
import { SlideLayoutSwitcher, AddBlockMenu } from './StudioBlockTools';
import { addBlock, contentContext, BLOCK_SPECS, type BlockKind, type BlockFill } from '../gamma/blocks';
import { authedJsonFetch } from '../../../desk/api';
import { imageFileToDataUrl } from '../gamma/imageFile';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ChevronDown, ChevronUp, Copy, GripVertical, ImagePlus, ImageOff, Minus, Plus, Redo2, Sparkles, Trash2, Undo2, Wand2 } from 'lucide-react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { CardContent, GammaLayout, SlideCard, SlideDeck } from '../types/slides';
import InSlidePromptCopilot from './InSlidePromptCopilot';
import { GammaSlide } from '../gamma/GammaCard';
import {
  GAMMA_LAYOUTS,
  createBlankCard,
  editSlideContent,
  getCardContent,
  reflowContent,
  resolveLayout,
  setSlideLayout,
  writeCardContent,
} from '../gamma/content';
import { DEFAULT_DECK_THEME_ID, resolveDeckTheme } from '../gamma/theme';
import { ExportPptxButton, ThemeMenu } from '../gamma/StudioControls';
import { autoDesignDeck } from '../gamma/composer';
import { useDeckHistory } from '../gamma/useDeckHistory';
import type { DeckTheme } from '../gamma/theme';

export interface Step03StudioCanvasProps {
  projectId?: string;
  deck: SlideDeck;
  onUpdateDeck: (updated: SlideDeck) => void;
  onPrevStep: () => void;
  onNextStep: () => void;
}

const iconBtn =
  'inline-flex items-center justify-center w-7 h-7 rounded-lg text-neutral-500 hover:text-neutral-900 hover:bg-neutral-900/[0.06] dark:text-neutral-400 dark:hover:text-white dark:hover:bg-white/[0.08] disabled:opacity-30 disabled:pointer-events-none cursor-pointer transition-colors';

const pillBtn =
  'inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-semibold text-neutral-700 dark:text-neutral-200 ring-1 ring-neutral-900/10 dark:ring-white/10 hover:bg-white dark:hover:bg-white/[0.05] cursor-pointer transition-colors disabled:opacity-40 disabled:pointer-events-none';

function renumber(slides: SlideCard[]): SlideCard[] {
  return slides.map((s, i) => ({ ...s, order: i + 1 }));
}

/** Add / remove one unit of content in whatever shape the layout uses. */
function adjustContent(content: CardContent, layout: GammaLayout, delta: 1 | -1): CardContent {
  const c = reflowContent(content, layout);
  if (layout === 'stats') {
    const stats = [...c.stats];
    if (delta > 0) stats.push({ value: String(stats.length + 1).padStart(2, '0'), label: 'New figure', detail: 'Add the source or context' });
    else stats.pop();
    return { ...c, stats };
  }
  if (layout === 'comparison' && c.columns) {
    const [l, r] = c.columns;
    const left = { ...l, points: [...l.points] };
    const right = { ...r, points: [...r.points] };
    if (delta > 0) {
      left.points.push('New point');
      right.points.push('New point');
    } else {
      left.points.pop();
      right.points.pop();
    }
    return { ...c, columns: [left, right] };
  }
  const items = [...c.items];
  if (delta > 0) items.push({ title: 'New point', body: layout === 'list' || layout === 'bento' || layout === 'timeline' ? 'Add a supporting detail' : undefined });
  else items.pop();
  return { ...c, items };
}

function unitCount(content: CardContent, layout: GammaLayout): number {
  const c = reflowContent(content, layout);
  if (layout === 'stats') return c.stats.length;
  if (layout === 'comparison') return Math.max(c.columns?.[0].points.length ?? 0, c.columns?.[1].points.length ?? 0);
  return c.items.length;
}


const UNIT_LIMIT: Partial<Record<GammaLayout, number>> = { bento: 6, stats: 4, timeline: 5, comparison: 6, list: 6, split: 4 };

interface ThumbProps {
  slide: SlideCard;
  index: number;
  total: number;
  active: boolean;
  theme: DeckTheme;
  onSelect: () => void;
  onMove: (dir: -1 | 1) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

/** One draggable card in the rail. Click selects; drag (or the grip + arrow keys) reorders. */
function SortableThumb({ slide, index, total, active, theme, onSelect, onMove, onDuplicate, onDelete }: ThumbProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: slide.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 20 : undefined }}
      className={`group relative shrink-0 w-[168px] lg:w-auto ${isDragging ? 'opacity-80' : ''}`}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? 'true' : undefined}
        aria-label={`Slide ${index + 1}: ${slide.actionHeadline}`}
        data-testid={`studio-thumb-${index}`}
        className="w-full flex items-start gap-2 text-left cursor-pointer"
        {...listeners}
      >
        <span className={`w-4 pt-1 text-[11px] tabular-nums text-right shrink-0 ${active ? 'text-neutral-900 dark:text-white font-semibold' : 'text-neutral-400'}`}>{index + 1}</span>
        <span
          className={`block flex-1 rounded-[10px] transition-shadow pointer-events-none ${
            active ? 'ring-2 ring-neutral-900 dark:ring-neutral-100 ring-offset-2 ring-offset-[#F8F7F4] dark:ring-offset-[#171717]' : 'ring-1 ring-transparent group-hover:ring-neutral-900/20 dark:group-hover:ring-white/20'
          }`}
        >
          <GammaSlide slide={slide} index={index} theme={theme} />
        </span>
      </button>
      <div className="absolute right-1 top-1 hidden group-hover:flex group-focus-within:flex items-center gap-0.5 p-0.5 rounded-lg bg-white/95 dark:bg-[#212121]/95 shadow-sm ring-1 ring-neutral-900/10 dark:ring-white/10">
        <button
          type="button"
          ref={setActivatorNodeRef}
          className={`${iconBtn} cursor-grab active:cursor-grabbing`}
          title="Drag to reorder (or focus and use arrow keys)"
          aria-label={`Reorder slide ${index + 1}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>
        <button type="button" className={iconBtn} title="Move up" aria-label={`Move slide ${index + 1} up`} disabled={index === 0} onClick={() => onMove(-1)}>
          <ChevronUp className="w-3.5 h-3.5" />
        </button>
        <button type="button" className={iconBtn} title="Move down" aria-label={`Move slide ${index + 1} down`} disabled={index === total - 1} onClick={() => onMove(1)}>
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
        <button type="button" className={iconBtn} title="Duplicate" aria-label={`Duplicate slide ${index + 1}`} onClick={onDuplicate}>
          <Copy className="w-3.5 h-3.5" />
        </button>
        <button type="button" className={iconBtn} title="Delete" aria-label={`Delete slide ${index + 1}`} onClick={onDelete}>
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </li>
  );
}

export default function Step03StudioCanvas({ projectId, deck, onUpdateDeck, onPrevStep, onNextStep }: Step03StudioCanvasProps) {
  const [activeIndex, setActiveIndex] = useState(() => Math.min(deck.activeSlideIndex || 0, Math.max(0, deck.slides.length - 1)));
  const [showCopilot, setShowCopilot] = useState(false);
  const [blockBusy, setBlockBusy] = useState<BlockKind | null>(null);
  const [blockError, setBlockError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const theme = useMemo(() => resolveDeckTheme(deck.themeId || DEFAULT_DECK_THEME_ID, deck.customTheme), [deck.themeId, deck.customTheme]);

  const slides = deck.slides;
  const index = Math.min(activeIndex, Math.max(0, slides.length - 1));
  const slide = slides[index];

  useEffect(() => {
    if (activeIndex > slides.length - 1 && slides.length > 0) setActiveIndex(slides.length - 1);
  }, [activeIndex, slides.length]);

  const history = useDeckHistory(deck, onUpdateDeck);

  const commit = useCallback(
    (nextSlides: SlideCard[], nextIndex = index, kind?: string) => {
      history.apply({ ...deck, slides: renumber(nextSlides), activeSlideIndex: nextIndex, updatedAt: new Date().toISOString() }, kind);
    },
    [deck, index, history],
  );

  const updateSlide = useCallback(
    (i: number, fn: (s: SlideCard) => SlideCard, kind?: string) => {
      const next = [...slides];
      next[i] = fn(next[i]);
      commit(next, i, kind);
    },
    [slides, commit],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = slides.findIndex((s) => s.id === active.id);
    const to = slides.findIndex((s) => s.id === over.id);
    if (from < 0 || to < 0) return;
    const wasActive = slides[index]?.id;
    const next = arrayMove(slides, from, to);
    const ni = Math.max(0, next.findIndex((s) => s.id === wasActive));
    setActiveIndex(ni);
    commit(next, ni);
  };

  const select = (i: number) => {
    setActiveIndex(i);
    if (deck.activeSlideIndex !== i) onUpdateDeck({ ...deck, activeSlideIndex: i });
  };

  // ↑/↓ moves between cards when the user isn't typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /input|textarea|select/i.test(t.tagName))) return;
      if (e.key === 'ArrowDown' || e.key === 'PageDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(slides.length - 1, i + 1));
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [slides.length]);

  if (!slide) {
    return (
      <div
        className="max-w-md mx-auto my-20 p-10 text-center rounded-3xl bg-white dark:bg-[#212121] ring-1 ring-neutral-900/[0.07] dark:ring-white/[0.07] space-y-4"
        data-testid="step-03-studio-canvas-empty"
      >
        <Sparkles className="w-6 h-6 mx-auto text-neutral-400" />
        <h3 className="text-base font-semibold text-neutral-900 dark:text-white">No Slides Created Yet</h3>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">Enter your topic or upload a document in Step 01 to generate your presentation slides.</p>
        <div className="flex items-center justify-center gap-2 pt-1">
          <button type="button" onClick={onPrevStep} className={pillBtn}>
            <ArrowLeft className="w-3.5 h-3.5" />
            Go to Step 01: Understand
          </button>
          <button type="button" onClick={() => commit([createBlankCard(1, deck.framework)], 0)} className={pillBtn}>
            <Plus className="w-3.5 h-3.5" />
            Blank card
          </button>
        </div>
      </div>
    );
  }

  const layout = resolveLayout(slide, index);
  const content = getCardContent(slide);
  const units = unitCount(content, layout);
  const limit = UNIT_LIMIT[layout];
  const supportsUnits = limit !== undefined;
  const supportsImage = layout === 'split' || layout === 'title';

  const handleEdit = (path: string, value: string) => updateSlide(index, (s) => editSlideContent(s, index, path, value));
  const handleLayout = (next: GammaLayout) => updateSlide(index, (s) => setSlideLayout(s, next));
  const handleAdjust = (delta: 1 | -1) => updateSlide(index, (s) => writeCardContent(s, adjustContent(getCardContent(s), layout, delta), layout));
  const handleAddField = (field: 'lede' | 'eyebrow' | 'takeaway') => {
    const placeholder = field === 'lede' ? 'Add a one-line subtitle' : field === 'eyebrow' ? 'Section label' : 'The one thing to remember';
    updateSlide(index, (s) => writeCardContent(s, { ...getCardContent(s), [field]: placeholder }, layout));
  };
  const handleImageFile = async (file: File | undefined) => {
    if (!file) return;
    setImageError(null);
    try {
      const url = await imageFileToDataUrl(file);
      updateSlide(index, (s) => writeCardContent(s, { ...getCardContent(s), image: { url, alt: content.headline } }, layout));
    } catch (err) {
      setImageError(err instanceof Error ? err.message : 'Could not read that image.');
    }
  };
  const handleAddBlock = async (kind: BlockKind, withAi: boolean) => {
    setBlockError(null);
    let fill: BlockFill = {};
    if (withAi && projectId) {
      setBlockBusy(kind);
      try {
        const spec = BLOCK_SPECS.find((b) => b.kind === kind);
        const res = await authedJsonFetch(`/api/projects/${encodeURIComponent(projectId)}/presentation/write-block`, 'POST', {
          kind: spec?.aiName ?? kind,
          slideTitle: content.headline,
          context: contentContext(content),
        });
        if (res.ok) {
          const data = (await res.json()) as { title?: string; body?: string };
          fill = { title: data.title, body: data.body };
        } else {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          setBlockError(err.error || 'Your AI could not write this block, so a guided placeholder was added.');
        }
      } catch {
        setBlockError('Your AI could not write this block, so a guided placeholder was added.');
      } finally {
        setBlockBusy(null);
      }
    }
    const result = addBlock(content, layout, kind, fill);
    if (!result.added) {
      setBlockError('This card is full. Remove a point first, or switch layout.');
      return;
    }
    updateSlide(index, (s) => writeCardContent(s, result.content, result.layout));
    if (result.needsImage) imageInputRef.current?.click();
  };
  const removeImage = () => updateSlide(index, (s) => writeCardContent(s, { ...getCardContent(s), image: undefined }, layout));

  const addCard = () => {
    const next = [...slides];
    next.splice(index + 1, 0, createBlankCard(index + 2, deck.framework));
    setActiveIndex(index + 1);
    commit(next, index + 1);
  };
  const duplicateCard = (i: number) => {
    const next = [...slides];
    next.splice(i + 1, 0, { ...slides[i], id: `${slides[i].id}-copy-${Date.now().toString(36)}` });
    setActiveIndex(i + 1);
    commit(next, i + 1);
  };
  const deleteCard = (i: number) => {
    const next = slides.filter((_, j) => j !== i);
    const ni = Math.max(0, Math.min(i, next.length - 1));
    setActiveIndex(ni);
    commit(next, ni);
  };
  const moveCard = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= slides.length) return;
    const next = [...slides];
    [next[i], next[j]] = [next[j], next[i]];
    setActiveIndex(j);
    commit(next, j);
  };

  return (
    <div className="space-y-5" data-testid="step-03-studio-canvas">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400">03 · Edit slides</p>
          <p className="text-sm text-neutral-600 dark:text-neutral-300 mt-1">
            Slide {index + 1} of {slides.length} · click any text on the card to edit it
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center h-8 rounded-full ring-1 ring-neutral-900/10 dark:ring-white/10 overflow-hidden">
            <button type="button" onClick={history.undo} disabled={!history.canUndo} title="Undo (⌘Z)" aria-label="Undo" className="h-8 w-8 inline-flex items-center justify-center text-neutral-600 dark:text-neutral-300 hover:bg-white dark:hover:bg-white/[0.05] disabled:opacity-30 cursor-pointer">
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={history.redo} disabled={!history.canRedo} title="Redo (⇧⌘Z)" aria-label="Redo" className="h-8 w-8 inline-flex items-center justify-center text-neutral-600 dark:text-neutral-300 hover:bg-white dark:hover:bg-white/[0.05] disabled:opacity-30 cursor-pointer">
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => history.apply({ ...autoDesignDeck(deck), activeSlideIndex: index })}
            title="Pick a layout for every card from its content"
            data-testid="studio-auto-design-btn"
            className={pillBtn}
          >
            <Wand2 className="w-3.5 h-3.5" /> Auto-design
          </button>
          <ThemeMenu deck={deck} onUpdateDeck={(d) => history.apply(d)} />
          <ExportPptxButton deck={deck} />
          <button
            type="button"
            onClick={onNextStep}
            aria-label="Proceed to Present (Delivery & Export)"
            className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-xs font-semibold bg-[#171717] text-[#F8F7F4] dark:bg-[#F8F7F4] dark:text-[#171717] hover:opacity-90 cursor-pointer"
          >
            Present
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[200px_minmax(0,1fr)] gap-6 items-start">
        {/* Thumbnail rail */}
        <aside aria-label="Slides" className="lg:sticky lg:top-0 space-y-2 lg:max-h-[calc(100vh-180px)] lg:overflow-y-auto lg:pr-1 -mr-1 order-2 lg:order-1">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={slides.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              <ol className="flex lg:flex-col gap-2.5 overflow-x-auto lg:overflow-visible pb-1">
                {slides.map((s, i) => (
                  <SortableThumb
                    key={s.id}
                    slide={s}
                    index={i}
                    total={slides.length}
                    active={i === index}
                    theme={theme}
                    onSelect={() => select(i)}
                    onMove={(dir) => moveCard(i, dir)}
                    onDuplicate={() => duplicateCard(i)}
                    onDelete={() => deleteCard(i)}
                  />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
          <button
            type="button"
            onClick={addCard}
            data-testid="studio-add-card-btn"
            className="w-full flex items-center justify-center gap-1.5 h-10 rounded-xl text-xs font-semibold text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white border border-dashed border-neutral-900/15 dark:border-white/15 hover:border-neutral-900/30 dark:hover:border-white/30 cursor-pointer lg:ml-6 lg:w-[calc(100%-1.5rem)]"
          >
            <Plus className="w-3.5 h-3.5" />
            Add card
          </button>
        </aside>

        {/* Card + controls */}
        <section className="min-w-0 space-y-4 order-1 lg:order-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SlideLayoutSwitcher layout={layout} onChange={handleLayout} />
            <AddBlockMenu onAdd={handleAddBlock} busyKind={blockBusy} canWriteWithAi={Boolean(projectId)} error={blockError} />
          </div>

          <GammaSlide slide={slide} index={index} theme={theme} editable onEdit={handleEdit} shadow data-testid="wysiwyg-slide-card" />

          {/* Content tools */}
          <div className="flex flex-wrap items-center gap-2" data-testid="studio-content-tools">
            {supportsUnits && (
              <div className="inline-flex items-center h-8 rounded-full ring-1 ring-neutral-900/10 dark:ring-white/10 overflow-hidden">
                <button type="button" onClick={() => handleAdjust(-1)} disabled={units <= 1} className="h-8 w-8 inline-flex items-center justify-center text-neutral-600 dark:text-neutral-300 hover:bg-white dark:hover:bg-white/[0.05] disabled:opacity-30 cursor-pointer" aria-label="Remove a point">
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="px-2 text-xs font-semibold tabular-nums text-neutral-700 dark:text-neutral-200">
                  {units} {layout === 'stats' ? (units === 1 ? 'figure' : 'figures') : units === 1 ? 'point' : 'points'}
                </span>
                <button type="button" onClick={() => handleAdjust(1)} disabled={limit !== undefined && units >= limit} className="h-8 w-8 inline-flex items-center justify-center text-neutral-600 dark:text-neutral-300 hover:bg-white dark:hover:bg-white/[0.05] disabled:opacity-30 cursor-pointer" aria-label="Add a point">
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            {!content.eyebrow && layout !== 'quote' && (
              <button type="button" className={pillBtn} onClick={() => handleAddField('eyebrow')}>
                <Plus className="w-3.5 h-3.5" /> Label
              </button>
            )}
            {!content.lede && layout !== 'quote' && (
              <button type="button" className={pillBtn} onClick={() => handleAddField('lede')}>
                <Plus className="w-3.5 h-3.5" /> Subtitle
              </button>
            )}
            {!content.takeaway && layout === 'stats' && (
              <button type="button" className={pillBtn} onClick={() => handleAddField('takeaway')}>
                <Plus className="w-3.5 h-3.5" /> Takeaway
              </button>
            )}
            {supportsImage && (
              <>
                <button type="button" className={pillBtn} onClick={() => imageInputRef.current?.click()}>
                  <ImagePlus className="w-3.5 h-3.5" /> {content.image ? 'Change image' : 'Add image'}
                </button>
                {content.image && (
                  <button type="button" className={pillBtn} onClick={removeImage}>
                    <ImageOff className="w-3.5 h-3.5" /> Remove image
                  </button>
                )}
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  data-testid="slide-image-file-input"
                  onChange={(e) => {
                    void handleImageFile(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
              </>
            )}
            {imageError && (
              <span role="alert" className="text-xs text-red-600 dark:text-red-400">
                {imageError}
              </span>
            )}
            <span className="flex-1" />
            <button type="button" className={pillBtn} onClick={() => setShowCopilot((v) => !v)} aria-expanded={showCopilot}>
              <Sparkles className="w-3.5 h-3.5" /> Rewrite with AI
            </button>
          </div>

          {showCopilot && (
            <InSlidePromptCopilot
              currentSlide={slide}
              deckId={deck.id}
              deckTopic={deck.topic}
              onMutateSlide={(mutated) => updateSlide(index, () => mutated)}
            />
          )}

          <div className="rounded-2xl bg-white dark:bg-[#212121] ring-1 ring-neutral-900/[0.07] dark:ring-white/[0.07] p-4">
            <label htmlFor={`notes-${slide.id}`} className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500 dark:text-neutral-400">
              Speaker notes
            </label>
            <textarea
              id={`notes-${slide.id}`}
              value={slide.speakerNotes || ''}
              onChange={(e) => updateSlide(index, (s) => ({ ...s, speakerNotes: e.target.value }), `notes:${slide.id}`)}
              rows={3}
              placeholder="What you'll say on this card: the story, transitions, timing cues."
              className="mt-2 w-full resize-y bg-transparent text-sm leading-relaxed text-neutral-800 dark:text-neutral-200 placeholder:text-neutral-400 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <button type="button" onClick={onPrevStep} aria-label="Back to Design (Themes)" className={pillBtn}>
              <ArrowLeft className="w-3.5 h-3.5" /> Design
            </button>
            <div className="flex items-center gap-1">
              <button type="button" className={iconBtn} aria-label="Previous slide" disabled={index === 0} onClick={() => select(index - 1)}>
                <ChevronUp className="w-4 h-4" />
              </button>
              <button type="button" className={iconBtn} aria-label="Next slide" disabled={index === slides.length - 1} onClick={() => select(index + 1)}>
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
