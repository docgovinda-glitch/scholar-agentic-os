import React, { useState, useRef } from "react";
import {
  ChevronDown,
  Upload,
  FileText,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";
import type { WritingStyleConfig, WritingStylePreset } from "../types";

export interface WritingStyleSelectorProps {
  value?: WritingStyleConfig;
  onChange: (style: WritingStyleConfig) => void;
  onFocus?: () => void;
}

export interface StyleOption {
  id: WritingStylePreset;
  title: string;
  description: string;
}

export const WRITING_STYLE_OPTIONS: StyleOption[] = [
  {
    id: "analytical",
    title: "Analytical",
    description: "Breaks down causes, patterns, and connections.",
  },
  {
    id: "argumentative",
    title: "Argumentative",
    description: "Defends a thesis and addresses counter-arguments.",
  },
  {
    id: "critical",
    title: "Critical",
    description: "Questions assumptions and exposes trade-offs/limitations.",
  },
  {
    id: "expository",
    title: "Expository",
    description: "Explains concepts clearly without dense jargon.",
  },
  {
    id: "natural",
    title: "Natural & Engaging",
    description: "Human academic voice avoiding AI clichés.",
  },
  {
    id: "custom",
    title: "Match My Writing",
    description: "Clones cadence and structure from uploaded samples.",
  },
];

export const TONE_SUGGESTION_CHIPS = [
  "Which tone best matches my assignment brief?",
  "Compare Analytical vs. Argumentative for this topic",
  "How can I calibrate custom voice cloning?",
];

export default function WritingStyleSelector({
  value,
  onChange,
  onFocus,
}: WritingStyleSelectorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  // Normalize current preset (support legacy presets by fallback or mapping)
  const currentPreset: WritingStylePreset = (() => {
    const rawPreset = (value?.preset as string) || "analytical";
    if (rawPreset === "scholarly_rigorous" || rawPreset === "objective_analytical") return "analytical";
    if (rawPreset === "critical_evaluative") return "critical";
    if (rawPreset === "applied_reflective") return "natural";
    if (rawPreset === "custom_match") return "custom";
    if (
      ["analytical", "argumentative", "critical", "expository", "natural", "custom"].includes(rawPreset)
    ) {
      return rawPreset as WritingStylePreset;
    }
    return "analytical";
  })();

  const currentOption =
    WRITING_STYLE_OPTIONS.find((o) => o.id === currentPreset) || WRITING_STYLE_OPTIONS[0];

  const customText = value?.customSampleText || "";
  const customFileName = value?.customFileName || "";

  const wordCount = customText.trim()
    ? customText.trim().split(/\s+/).filter(Boolean).length
    : 0;

  const triggerToneAssistantContext = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("scholar:copilot-suggested-actions", {
          detail: {
            actions: TONE_SUGGESTION_CHIPS,
            source: "tone-calibration",
          },
        })
      );
      window.dispatchEvent(
        new CustomEvent("scholar:advisor-suggested-actions", {
          detail: {
            actions: TONE_SUGGESTION_CHIPS,
            source: "tone-calibration",
          },
        })
      );
    }
  };

  const handleSelect = (preset: WritingStylePreset) => {
    const opt = WRITING_STYLE_OPTIONS.find((o) => o.id === preset);
    onChange({
      preset,
      description: opt?.description,
      customSampleText: preset === "custom" ? customText : undefined,
      customFileName: preset === "custom" ? customFileName : undefined,
    });
    triggerToneAssistantContext();
  };

  const handleFocus = () => {
    onFocus?.();
    triggerToneAssistantContext();
  };

  const handleTextChange = (text: string) => {
    onChange({
      preset: "custom",
      description: "Clones cadence and structure from uploaded samples.",
      customSampleText: text,
      customFileName: customFileName || undefined,
    });
  };

  const processFile = async (file: File) => {
    setIsReadingFile(true);
    try {
      if (file.name.endsWith(".txt") || file.name.endsWith(".md")) {
        const text = await file.text();
        onChange({
          preset: "custom",
          description: `Custom voice calibrated from ${file.name}.`,
          customFileName: file.name,
          customSampleText: text.slice(0, 10000),
        });
      } else {
        const placeholderNotice = `[Sample document attached: ${file.name} (${Math.round(
          file.size / 1024
        )} KB)]. The drafting engine will calibrate stylistic pacing, syntactic complexity, and vocabulary register against this writing sample.`;
        onChange({
          preset: "custom",
          description: `Custom voice calibrated from ${file.name}.`,
          customFileName: file.name,
          customSampleText: customText.trim() ? customText : placeholderNotice,
        });
      }
      triggerToneAssistantContext();
    } catch (err) {
      console.error("Failed to read sample file:", err);
    } finally {
      setIsReadingFile(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleRemoveFile = () => {
    onChange({
      preset: "custom",
      description: "Clones cadence and structure from uploaded samples.",
      customSampleText: customText.startsWith("[Sample document attached:") ? "" : customText,
      customFileName: undefined,
    });
  };

  return (
    <div className="space-y-2">
      {/* Surface & Label Header */}
      <div>
        <label
          htmlFor="writing-tone-select"
          className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 block"
        >
          Writing Tone
        </label>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
          Select an academic voice or match your personal writing style.
        </p>
      </div>

      {/* Minimal Apple/Airbnb Dropdown Selector */}
      <div className="relative w-full max-w-lg">
        <select
          id="writing-tone-select"
          aria-label="Writing Tone"
          value={currentPreset}
          onChange={(e) => handleSelect(e.target.value as WritingStylePreset)}
          onFocus={handleFocus}
          className="w-full max-w-lg bg-white dark:bg-ink-750 border border-neutral-200/80 dark:border-white/10 rounded-xl px-4 py-3 pr-10 text-sm text-neutral-900 dark:text-neutral-100 shadow-xs dark:shadow-none hover:border-neutral-300 dark:hover:border-white/20 transition-all cursor-pointer focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-white appearance-none"
        >
          {WRITING_STYLE_OPTIONS.map((opt) => (
            <option
              key={opt.id}
              value={opt.id}
              className="bg-white dark:bg-ink-750 text-neutral-900 dark:text-neutral-100 py-1"
            >
              {opt.title} — {opt.description}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3.5 text-neutral-400 dark:text-neutral-500">
          <ChevronDown className="w-4 h-4" />
        </div>
      </div>

      {/* Single-line descriptor of active selection */}
      <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-2">
        {currentOption.description}
      </p>

      {/* Voice Cloning: Match My Writing Input Area */}
      {currentPreset === "custom" && (
        <div className="p-5 rounded-2xl border border-neutral-300/80 dark:border-white/15 bg-neutral-50/70 dark:bg-white/[0.02] space-y-4 animate-in fade-in slide-in-from-top-2 duration-200 mt-3">
          <div className="flex items-center justify-between border-b border-neutral-200/60 dark:border-white/5 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-neutral-200/80 dark:bg-white/10 flex items-center justify-center text-neutral-800 dark:text-neutral-200">
                <Wand2 className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                  Clone Your Academic Voice
                </h4>
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                  Provide an excerpt from a previous paper or upload an essay file (`.docx`, `.pdf`, `.txt`).
                </p>
              </div>
            </div>

            <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-neutral-200/60 dark:bg-white/10 text-neutral-700 dark:text-neutral-300">
              {wordCount} words {wordCount >= 200 && wordCount <= 500 ? "✓ Optimal" : "(200–500 ideal)"}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Option 1: Paste Textarea */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
                  <FileText className="w-3 h-3 text-neutral-400" />
                  <span>Option A: Paste Past Writing Sample</span>
                </label>
                <span className="text-[10px] text-neutral-400">200–500 words</span>
              </div>
              <textarea
                value={customText.startsWith("[Sample document attached:") ? "" : customText}
                onChange={(e) => handleTextChange(e.target.value)}
                rows={5}
                placeholder="Paste an excerpt from an essay or paper you have previously written. The drafting engine will analyze your syntactic rhythm, transition words, and vocabulary choice..."
                className="w-full bg-white dark:bg-ink-750 border border-neutral-200/80 dark:border-white/10 rounded-xl p-3 text-xs text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-white transition-all resize-y leading-relaxed font-sans"
              />
            </div>

            {/* Option 2: Upload Document Dropzone */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
                  <Upload className="w-3 h-3 text-neutral-400" />
                  <span>Option B: Upload Previous Essay</span>
                </label>
                <span className="text-[10px] text-neutral-400">.docx, .pdf, .txt</span>
              </div>

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
                className={`border border-dashed rounded-xl p-4 flex flex-col items-center justify-center text-center transition-all h-[126px] ${
                  isDragOver
                    ? "border-neutral-900 dark:border-white bg-neutral-100 dark:bg-white/10"
                    : "border-neutral-300 dark:border-white/15 bg-white dark:bg-ink-750 hover:border-neutral-400"
                }`}
              >
                {customFileName ? (
                  <div className="space-y-2">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
                      <FileText className="w-3.5 h-3.5" />
                      <span className="truncate max-w-[180px]">{customFileName}</span>
                      <button
                        type="button"
                        onClick={handleRemoveFile}
                        className="hover:text-red-500 ml-1 p-0.5 cursor-pointer"
                        title="Remove file"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                    <p className="text-[10px] text-neutral-400">
                      Sample loaded and ready for Phase 3 voice calibration
                    </p>
                  </div>
                ) : (
                  <>
                    <Upload className="w-5 h-5 text-neutral-400 mb-1" />
                    <p className="text-xs font-medium text-neutral-800 dark:text-neutral-200">
                      Drag & drop your sample essay here
                    </p>
                    <p className="text-[10px] text-neutral-400 mb-2">
                      or click to browse files
                    </p>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isReadingFile}
                      className="px-3 py-1 rounded-lg text-[11px] font-semibold bg-neutral-100 dark:bg-white/10 hover:bg-neutral-200 dark:hover:bg-white/15 text-neutral-800 dark:text-neutral-200 transition-colors cursor-pointer"
                    >
                      {isReadingFile ? "Reading..." : "Select File"}
                    </button>
                  </>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".docx,.doc,.pdf,.txt,.md"
                onChange={handleFileInputChange}
                className="hidden"
              />
            </div>
          </div>

          {/* Voice calibration tip */}
          <div className="p-3 rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200/60 dark:border-white/5 flex items-start gap-2.5 text-[11px] text-neutral-600 dark:text-neutral-400">
            <Sparkles className="w-3.5 h-3.5 text-neutral-700 dark:text-neutral-300 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                How voice calibration works:{" "}
              </span>
              The AI Scribe studies your typical sentence structures, paragraph transition styles, and balance between passive and active voice to preserve your authentic student persona.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
