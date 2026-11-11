import React, { useRef, useState } from 'react';
import { ChevronDown, FileText, Loader2, Sparkles, Trash2, Upload } from 'lucide-react';
import type { SlideDeck } from '../types/slides';
import { composeDeckFromOutline } from '../gamma/composer';
import { DEFAULT_DECK_THEME_ID } from '../gamma/theme';
import { normalizeDeck } from '../gamma/content';
import { authedJsonFetch } from '../../../desk/api';
import { stripCourseCodes } from '../../../utils/briefExtractor';
import { buildOutlineFromBrief, cleanBriefText, deriveDocumentTitle, type OutlineCard } from '../../../shared/presentationBrief';
import OutlineBuilder from './OutlineBuilder';

export interface Step01UnderstandProps {
  projectId?: string;
  deck: SlideDeck;
  onUpdateDeck: (updated: SlideDeck) => void;
  onNextStep: () => void;
}

export const SLIDE_COUNT_OPTIONS = [6, 8, 10, 12, 15] as const;

/** Speaking time per slide, rounded to 15 seconds, as m:ss. */
export function perSlideTime(minutes: number, slides: number): string {
  const sec = Math.max(15, Math.round((minutes * 60) / Math.max(1, slides) / 15) * 15);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

const signature = (cards: OutlineCard[]) => JSON.stringify(cards.map((c) => [c.title, c.visualType, c.bullets]));
const nearestCount = (n: number) => SLIDE_COUNT_OPTIONS.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a));

export default function Step01Understand({ projectId, deck, onUpdateDeck, onNextStep }: Step01UnderstandProps) {
  const [topic, setTopic] = useState(deck.topic || (deck.title && deck.title !== 'Untitled Presentation' ? deck.title : '') || '');
  const [inputMode, setInputMode] = useState<'topic' | 'upload'>('topic');
  const [slideCount, setSlideCount] = useState<number>(nearestCount(deck.outline?.length || deck.slides.length || 10));
  const [rawText, setRawText] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileWords, setFileWords] = useState(0);
  const [cards, setCards] = useState<OutlineCard[]>(() => (deck.outline ?? []).map((c) => ({ ...c, visualType: c.visualType as OutlineCard['visualType'] })));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const persistOutline = (next: OutlineCard[], title = deck.title) => {
    setCards(next);
    onUpdateDeck({ ...deck, title, topic: title, outline: next });
  };

  /** Outline from the server (scholarBrain); a brief-grounded outline when offline or signed out. */
  const requestOutline = async (opts: { text?: string; title?: string; instruction?: string; file?: string } = {}) => {
    const material = cleanBriefText(opts.text ?? rawText);
    const topicNow = stripCourseCodes(opts.title ?? topic).trim();
    if (!material.trim() && !topicNow) {
      setError('Add a topic or upload a document first.');
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (projectId) {
        const res = await authedJsonFetch(`/api/projects/${encodeURIComponent(projectId)}/presentation/outline`, 'POST', {
          rawText: material || undefined,
          topic: topicNow || undefined,
          fileName: opts.file ?? fileName,
          slideCount,
          instruction: opts.instruction,
          current: opts.instruction ? cards.map((c) => ({ title: c.title, bullets: c.bullets })) : undefined,
        });
        if (res.ok) {
          const data = (await res.json()) as { title?: string; slides?: OutlineCard[]; generatedBy?: string };
          if (Array.isArray(data.slides) && data.slides.length) {
            const title = data.title || topicNow || deck.title;
            setTopic(title);
            persistOutline(data.slides, title);
            if (data.generatedBy !== 'ai-gateway') {
              setNotice('No AI answered, so this outline is built from your document\'s own questions and sections. Connect an AI in AI Access for a fully written outline.');
            }
            return;
          }
        } else if (res.status === 401) {
          setNotice('Sign in so your AI can write the outline. This outline is built from your document.');
        } else {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          setNotice(`The AI could not write the outline${err.error ? `: ${err.error}` : ''}. This outline is built from your document.`);
        }
      }
      const local = buildOutlineFromBrief(material || topicNow, slideCount, topicNow || undefined);
      setTopic(local.title);
      persistOutline(local.slides, local.title);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not build the outline.');
    } finally {
      setBusy(false);
    }
  };

  const processFile = async (file: File) => {
    setError(null);
    setNotice(null);
    setFileName(file.name);
    setBusy(true);
    try {
      const lower = file.name.toLowerCase();
      let text = '';
      let title = '';
      if (/\.(txt|md|markdown)$/.test(lower)) {
        text = await file.text();
        title = deriveDocumentTitle(text, file.name);
      } else {
        const form = new FormData();
        form.append('file', file);
        let authHeader: Record<string, string> = {};
        try {
          const { isSupabaseConfigured, getSupabaseClient } = await import('../../../services/supabaseClient');
          if (isSupabaseConfigured()) {
            const { data } = await getSupabaseClient().auth.getSession();
            if (data?.session?.access_token) authHeader = { Authorization: `Bearer ${data.session.access_token}` };
          }
        } catch {
          // signed out or offline: the server decides
        }
        const res = await fetch('/api/presentations/parse-document', { method: 'POST', headers: authHeader, body: form });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(err.error || `The document could not be read (HTTP ${res.status}).`);
        }
        const data = (await res.json()) as { text?: string; detectedTitle?: string };
        text = data.text || '';
        title = data.detectedTitle || deriveDocumentTitle(text, file.name);
      }
      text = cleanBriefText(text);
      if (!text.trim()) throw new Error('Could not extract readable text from this document.');
      setRawText(text);
      setFileWords(text.split(/\s+/).filter(Boolean).length);
      setTopic(title);
      setBusy(false);
      // Uploading is enough: the outline is written straight away.
      await requestOutline({ text, title, file: file.name });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to process the document.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removeFile = () => {
    setFileName('');
    setRawText('');
    setFileWords(0);
  };

  /** Turn the reviewed outline into slides (AI-written copy when available), then move on. */
  const proceed = async () => {
    const sig = signature(cards);
    if (deck.slides.length > 0 && deck.outlineBuiltFrom === sig) {
      onNextStep();
      return;
    }
    setBusy(true);
    setNotice(null);
    let built: SlideDeck | null = null;
    try {
      if (projectId) {
        const res = await authedJsonFetch(`/api/projects/${encodeURIComponent(projectId)}/presentation/generate-deck`, 'POST', {
          title: deck.title,
          topic: deck.title,
          rawText: rawText || undefined,
          slideCount: cards.length,
          outline: cards.map((c) => ({ title: c.title, visualType: c.visualType, bullets: c.bullets.filter(Boolean) })),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.generatedBy === 'ai-gateway' && data.deck?.slides?.length >= cards.length) {
            built = { ...normalizeDeck(data.deck as SlideDeck), id: deck.id || data.deck.id };
          } else {
            setNotice('No AI is connected, so the slides use your outline as written. Connect one in AI Access to have the copy written.');
          }
        }
      }
    } catch {
      setNotice('The AI could not write the slide copy, so the slides use your outline as written.');
    }
    if (!built) built = composeDeckFromOutline(cards.map((c) => ({ ...c, bullets: c.bullets.filter(Boolean) })), { title: deck.title, deckId: deck.id });
    onUpdateDeck({
      ...built,
      id: deck.id || built.id,
      title: deck.title,
      topic: deck.title,
      outline: cards,
      outlineBuiltFrom: sig,
      themeId: deck.themeId || DEFAULT_DECK_THEME_ID,
      customTheme: deck.customTheme,
    });
    setBusy(false);
    onNextStep();
  };

  const hasOutline = cards.length > 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6 p-4 sm:p-6 text-neutral-900 dark:text-neutral-100 font-sans" data-testid="step-01-understand">
      <div>
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide uppercase bg-neutral-100 dark:bg-white/10 text-neutral-800 dark:text-neutral-200">
          Phase 1 · Understand
        </span>
        <h1 className="mt-1.5 text-xl sm:text-2xl font-semibold tracking-tight">Outline your presentation</h1>
        <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 mt-1">
          Upload your brief or type a topic. Your AI reads it and drafts a slide-by-slide outline you can edit.
        </p>
      </div>

      <div className="bg-white dark:bg-[#1C1C1E] border border-neutral-200/80 dark:border-white/10 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
        <div className="inline-flex p-1 rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200/60 dark:border-white/10">
          {(['topic', 'upload'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setInputMode(mode)}
              className={`py-1.5 px-3 rounded-lg text-xs font-medium cursor-pointer ${
                inputMode === mode ? 'bg-white dark:bg-[#2C2C2E] shadow-2xs font-semibold text-neutral-900 dark:text-white' : 'text-neutral-500 dark:text-neutral-400'
              }`}
            >
              {mode === 'topic' ? 'Enter Topic or Question' : 'Upload Document (.pdf, .docx)'}
            </button>
          ))}
        </div>

        {inputMode === 'topic' ? (
          <div className="space-y-1.5">
            <label htmlFor="presentation-topic" className="text-xs font-semibold">Presentation topic</label>
            <input
              id="presentation-topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Branches of quantum computing"
              className="w-full h-10 rounded-xl border border-neutral-200 dark:border-white/10 bg-transparent px-3 text-sm"
            />
          </div>
        ) : fileName ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="text-xs font-medium truncate">{fileName}</span>
              {fileWords > 0 && <span className="text-[11px] text-neutral-500 shrink-0">{fileWords.toLocaleString()} words read</span>}
            </div>
            <button type="button" onClick={removeFile} aria-label="Remove file" className="text-neutral-400 hover:text-red-500 cursor-pointer">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files?.[0];
              if (f) void processFile(f);
            }}
            onClick={() => fileRef.current?.click()}
            className={`cursor-pointer rounded-xl border-2 border-dashed px-4 py-8 text-center ${
              dragging ? 'border-neutral-900 dark:border-white bg-neutral-50 dark:bg-white/5' : 'border-neutral-200 dark:border-white/10'
            }`}
          >
            <Upload className="w-5 h-5 mx-auto text-neutral-400" />
            <p className="mt-2 text-xs font-medium">Drop a PDF, DOCX or text file, or click to choose</p>
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.docx,.doc,.pptx,.txt,.md,.markdown"
          className="hidden"
          data-testid="presentation-file-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void processFile(f);
          }}
        />

        <div className="flex flex-wrap items-end gap-3 pt-1">
          <div className="space-y-1">
            <label htmlFor="slide-count" className="text-xs font-semibold">Slide count</label>
            <div className="relative">
              <select
                id="slide-count"
                aria-label="Slide Count"
                value={slideCount}
                onChange={(e) => setSlideCount(Number(e.target.value))}
                className="h-9 w-36 appearance-none rounded-lg border border-neutral-200/80 dark:border-white/10 bg-white dark:bg-[#2C2C2E] px-3 pr-8 text-xs font-medium cursor-pointer"
              >
                {SLIDE_COUNT_OPTIONS.map((n) => (
                  <option key={n} value={n}>{n} slides</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" />
            </div>
          </div>
          <button
            type="button"
            onClick={() => void requestOutline()}
            disabled={busy || (!topic.trim() && !rawText.trim())}
            className="h-9 rounded-xl px-4 bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-xs font-semibold inline-flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-amber-400" />}
            {busy ? 'Working…' : hasOutline ? 'Rebuild outline' : 'Generate outline'}
          </button>
        </div>
        {error && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        {notice && <p role="status" className="text-xs text-neutral-600 dark:text-neutral-400">{notice}</p>}
      </div>

      {hasOutline ? (
        <div className="space-y-5" data-testid="generated-outline-section">
          <div className="space-y-1.5">
            <label htmlFor="presentation-title" className="text-xs font-semibold">Presentation title</label>
            <input
              id="presentation-title"
              aria-label="Presentation title"
              value={deck.title}
              onChange={(e) => {
                setTopic(e.target.value);
                onUpdateDeck({ ...deck, title: e.target.value, topic: e.target.value });
              }}
              className="w-full h-11 rounded-xl border border-neutral-200 dark:border-white/10 bg-transparent px-3 text-base font-semibold"
            />
          </div>
          <OutlineBuilder
            cards={cards}
            onChange={(next) => persistOutline(next)}
            onRegenerate={(instruction) => void requestOutline({ instruction })}
            busy={busy}
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void proceed()}
              disabled={busy}
              className="px-6 py-2.5 rounded-xl font-medium text-xs bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:opacity-90 disabled:opacity-50 flex items-center gap-2 cursor-pointer"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              <span>Proceed to Design</span>
              <span>→</span>
            </button>
          </div>
        </div>
      ) : (
        <div data-testid="zero-ghost-outline-empty-state" className="border-2 border-dashed border-neutral-200/80 dark:border-white/10 rounded-2xl p-10 text-center text-xs sm:text-sm text-neutral-500 dark:text-neutral-400">
          Your outline appears here once you add a topic or upload your brief.
        </div>
      )}
    </div>
  );
}

