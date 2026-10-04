import React, { useState, useRef } from 'react';
import {
  Sparkles,
  Camera,
  X,
  ArrowRight,
  Loader2,
  CheckCircle2,
  Zap,
  Image as ImageIcon,
  BarChart3,
  Columns,
  PenTool,
} from 'lucide-react';
import type { SlideCard } from '../types/slides';
import type { CustomTheme } from '../types/themes';
import {
  applyQuickMutation,
  executeSlidePrompt,
  type SlideMutationAction,
} from '../services/slideMutationService';

export interface InSlidePromptCopilotProps {
  currentSlide: SlideCard;
  deckId: string;
  deckTopic?: string;
  onMutateSlide: (mutated: SlideCard, message?: string) => void;
  onCloneTheme?: (theme: CustomTheme) => void;
  className?: string;
}

export const QUICK_MUTATION_CHIPS: Array<{
  id: SlideMutationAction;
  label: string;
  icon: React.ReactNode;
  hint: string;
}> = [
  {
    id: 'make-concise',
    label: '⚡ Make More Concise (6x6 Rule)',
    icon: <Zap className="w-3 h-3 text-amber-500" />,
    hint: 'Condense bullets to max 6 words per bullet',
  },
  {
    id: 'convert-to-split-image',
    label: '🖼 Convert to Split Image',
    icon: <ImageIcon className="w-3 h-3 text-blue-500" />,
    hint: 'Transform to 50/50 split media layout',
  },
  {
    id: 'highlight-as-big-metric',
    label: '📊 Highlight as Big Metric',
    icon: <BarChart3 className="w-3 h-3 text-emerald-500" />,
    hint: 'Feature large quantitative metric callout',
  },
  {
    id: 'change-to-two-column',
    label: '⚖️ Change to 2-Column Comparison',
    icon: <Columns className="w-3 h-3 text-indigo-500" />,
    hint: 'Split content into side-by-side comparison',
  },
  {
    id: 'strengthen-active-voice',
    label: '✍️ Strengthen Active Voice',
    icon: <PenTool className="w-3 h-3 text-purple-500" />,
    hint: 'Convert passive headline into decisive action verb assertion',
  },
];

export default function InSlidePromptCopilot({
  currentSlide,
  deckId,
  deckTopic,
  onMutateSlide,
  onCloneTheme,
  className = '',
}: InSlidePromptCopilotProps) {
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  // Reference screenshot state
  const [referenceScreenshot, setReferenceScreenshot] = useState<string | null>(null);
  const [referenceFileName, setReferenceFileName] = useState<string | null>(null);
  const [isDraggingReference, setIsDraggingReference] = useState(false);
  const [cloneThemeWithScreenshot, setCloneThemeWithScreenshot] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showFeedback = (msg: string) => {
    setFeedbackMessage(msg);
    setTimeout(() => setFeedbackMessage(null), 4000);
  };

  // Quick Action Pill Handler
  const handleQuickAction = (actionId: SlideMutationAction) => {
    setIsLoading(true);
    try {
      const mutated = applyQuickMutation(currentSlide, actionId);
      const chip = QUICK_MUTATION_CHIPS.find((c) => c.id === actionId);
      const msg = chip ? `✓ ${chip.label}` : '✓ Slide transformed';
      onMutateSlide(mutated, msg);
      showFeedback(msg);
    } catch (err) {
      console.error('Quick mutation error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Submit Prompt Handler
  const handleSubmitPrompt = async () => {
    if (!prompt.trim() && !referenceScreenshot) return;
    setIsLoading(true);

    try {
      const result = await executeSlidePrompt({
        currentSlide,
        prompt: prompt.trim() || 'Replicate slide layout, structure, and visual hierarchy from reference screenshot',
        deckId,
        deckTopic,
        referenceImage: referenceScreenshot || undefined,
        cloneTheme: cloneThemeWithScreenshot,
      });

      onMutateSlide(result.mutatedSlide, result.message);
      if (result.customTheme && cloneThemeWithScreenshot && onCloneTheme) {
        onCloneTheme(result.customTheme);
      }
      showFeedback(result.message);
      setPrompt('');
    } catch (err) {
      console.error('In-slide copilot execution error:', err);
      showFeedback('Could not execute mutation. Reverting to original slide.');
    } finally {
      setIsLoading(false);
    }
  };

  // Reference Screenshot Handlers
  const handleImageFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (result) {
        setReferenceScreenshot(result);
        setReferenceFileName(file.name);
        if (!prompt.trim()) {
          setPrompt('Replicate this slide layout and visual hierarchy');
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          handleImageFile(file);
          break;
        }
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingReference(false);
    const files = e.dataTransfer?.files;
    if (files && files[0]) {
      handleImageFile(files[0]);
    }
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDraggingReference(true);
      }}
      onDragLeave={() => setIsDraggingReference(false)}
      onDrop={handleDrop}
      className={`bg-white dark:bg-[#1C1C1E] border rounded-2xl p-4 shadow-sm space-y-3 transition-all ${
        isDraggingReference
          ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/50 dark:bg-blue-950/20'
          : referenceScreenshot
          ? 'border-blue-500/40 ring-1 ring-blue-500/10'
          : 'border-blue-500/30'
      } ${className}`}
      data-testid="in-slide-copilot-container"
    >
      {/* Header Row: Title & Reference Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-extrabold uppercase tracking-wide text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>In-Slide AI Prompt Copilot</span>
          </span>
          <span className="text-[11px] text-neutral-400 hidden sm:inline">
            Mutates slide structure and active tone instantly
          </span>
        </div>

        {/* Attach Reference Screenshot Button */}
        <div className="flex items-center gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImageFile(file);
            }}
            accept="image/png,image/jpeg,image/webp,image/jpg"
            className="hidden"
            data-testid="copilot-reference-input"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-2.5 py-1 text-[11px] font-semibold rounded-lg border border-blue-500/30 bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Upload or paste a slide screenshot to replicate"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>{referenceScreenshot ? 'Change Reference' : 'Attach Reference Screenshot'}</span>
          </button>
        </div>
      </div>

      {/* Attached Reference Screenshot Banner */}
      {referenceScreenshot && (
        <div className="p-2.5 rounded-xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-800/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative group shrink-0">
              <img
                src={referenceScreenshot}
                alt="Reference Screenshot"
                className="w-14 h-9 object-cover rounded-lg border border-blue-300 dark:border-blue-700 shadow-2xs"
              />
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white dark:border-[#1C1C1E]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-neutral-900 dark:text-neutral-100">
                  📸 Reference Screenshot Attached
                </span>
                <span className="text-[10px] font-mono text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded bg-blue-100/70 dark:bg-blue-900/40">
                  Ready to Replicate
                </span>
              </div>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate max-w-md">
                {referenceFileName || 'Attached slide capture'} · AI will replicate exact layout &amp; visual hierarchy
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <label className="text-[11px] font-medium text-neutral-600 dark:text-neutral-300 flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={cloneThemeWithScreenshot}
                onChange={(e) => setCloneThemeWithScreenshot(e.target.checked)}
                className="rounded border-neutral-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
              />
              <span>Clone Colors</span>
            </label>
            <button
              type="button"
              onClick={() => {
                setReferenceScreenshot(null);
                setReferenceFileName(null);
              }}
              className="p-1 rounded-md text-neutral-400 hover:text-red-500 hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
              title="Remove reference screenshot"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Status Feedback Toast */}
      {feedbackMessage && (
        <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 px-1 animate-fade-in">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>{feedbackMessage}</span>
        </div>
      )}

      {/* Floating Prompt Pill Input */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onPaste={handlePaste}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmitPrompt();
            }}
            placeholder={
              referenceScreenshot
                ? 'e.g. "Replicate this exact slide layout" or "Clone layout and adapt to my topic"'
                : 'Ask AI to mutate this slide... (e.g. "Make concise", "Convert to split image", "Highlight metric")'
            }
            className="w-full px-4 py-2 pr-9 text-xs rounded-xl border border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-black/20 text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            aria-label="Ask AI to mutate this slide"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors p-1 cursor-pointer"
            title="Attach screenshot (or press Cmd+V to paste)"
          >
            <Camera className="w-3.5 h-3.5" />
          </button>
        </div>

        <button
          type="button"
          onClick={handleSubmitPrompt}
          disabled={isLoading || (!prompt.trim() && !referenceScreenshot)}
          className={`px-4 py-2 text-xs font-bold uppercase rounded-xl text-white shadow-xs transition-all disabled:opacity-50 flex items-center gap-1.5 shrink-0 cursor-pointer ${
            referenceScreenshot
              ? 'bg-emerald-600 hover:bg-emerald-700'
              : 'bg-blue-600 hover:bg-blue-700'
          }`}
          aria-label="Submit slide mutation prompt"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>{referenceScreenshot ? 'Replicating...' : 'Mutating...'}</span>
            </>
          ) : (
            <>
              <span>{referenceScreenshot ? '✨ Replicate' : 'Apply'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </>
          )}
        </button>
      </div>

      {/* Quick AI Transformation Chips */}
      <div className="space-y-1 pt-0.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
            Quick AI Transformations:
          </span>
          <span className="text-[10px] text-neutral-400">One-click mutations</span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {QUICK_MUTATION_CHIPS.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => handleQuickAction(chip.id)}
              disabled={isLoading}
              title={chip.hint}
              aria-label={
                chip.id === 'change-to-two-column'
                  ? 'AI Mutation: Side-by-Side Comparative Analysis'
                  : `AI Mutation: ${chip.label}`
              }
              className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-neutral-100 dark:bg-white/5 hover:bg-blue-50 dark:hover:bg-blue-950/40 text-neutral-700 dark:text-neutral-300 hover:text-blue-600 dark:hover:text-blue-400 border border-neutral-200/80 dark:border-white/10 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <span>{chip.icon}</span>
              <span>{chip.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
