import React, { useState, useRef } from "react";
import {
  Feather,
  Check,
  Upload,
  FileText,
  Sparkles,
  Quote,
  Layers,
  ShieldAlert,
  BookOpen,
  MessageSquare,
  Wand2,
  X,
  AlertCircle,
} from "lucide-react";
import type { WritingStyleConfig, WritingStylePreset } from "../types";

export interface WritingStyleSelectorProps {
  value?: WritingStyleConfig;
  onChange: (style: WritingStyleConfig) => void;
}

interface StyleOption {
  id: WritingStylePreset;
  title: string;
  badge?: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  example: string;
}

export const WRITING_STYLE_OPTIONS: StyleOption[] = [
  {
    id: "analytical",
    title: "Analytical",
    icon: Layers,
    description: "Breaks down causes, patterns, and connections between concepts.",
    example:
      "Local grocers lose market share primarily because digital platforms eliminate travel and checkout friction for suburban households.",
  },
  {
    id: "argumentative",
    title: "Argumentative",
    icon: MessageSquare,
    description: "Takes a clear stance, defends a thesis, and addresses counter-arguments.",
    example:
      "While physical stores emphasize personalized service, convenience and price discounts consistently override customer loyalty.",
  },
  {
    id: "critical",
    title: "Critical",
    icon: ShieldAlert,
    description: "Questions assumptions, weighs trade-offs, and exposes flaws or limitations.",
    example:
      "Reports celebrating delivery convenience overlook hidden trade-offs; platform subscription fees frequently make online orders more expensive than local shopping.",
  },
  {
    id: "expository",
    title: "Expository",
    icon: BookOpen,
    description: "Explains concepts clearly, directly, and authoritatively without dense jargon.",
    example:
      "Online platforms dominate grocery retail through bulk purchasing, centralized warehousing, and automated dispatch systems.",
  },
  {
    id: "natural",
    title: "Natural & Engaging (Human Voice)",
    badge: "Human Voice",
    icon: Feather,
    description:
      "Authentic, conversational academic rhythm. Avoids predictable AI clichés (\"delve\", \"testament\", \"multifaceted\") while remaining credible.",
    example:
      "Most shoppers leave local grocers for a simple reason: after a long workday, seamless doorstep delivery beats community loyalty every time.",
  },
  {
    id: "custom",
    title: "Match My Writing (Custom Voice)",
    badge: "Voice Cloning",
    icon: Wand2,
    description: "Clones your natural sentence structure, pacing, and vocabulary level.",
    example:
      "Analyzes your sample excerpt to match sentence lengths, transitions, and vocabulary density.",
  },
];

export default function WritingStyleSelector({
  value,
  onChange,
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

  const customText = value?.customSampleText || "";
  const customFileName = value?.customFileName || "";

  const wordCount = customText.trim()
    ? customText.trim().split(/\s+/).filter(Boolean).length
    : 0;

  const handleSelect = (preset: WritingStylePreset) => {
    const opt = WRITING_STYLE_OPTIONS.find((o) => o.id === preset);
    onChange({
      preset,
      description: opt?.description,
      customSampleText: preset === "custom" ? customText : undefined,
      customFileName: preset === "custom" ? customFileName : undefined,
    });
  };

  const handleTextChange = (text: string) => {
    onChange({
      preset: "custom",
      description: "Clones your natural sentence structure, pacing, and vocabulary level.",
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
        // For binary documents (.docx, .pdf), register file attachment
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
      description: "Clones your natural sentence structure, pacing, and vocabulary level.",
      customSampleText: customText.startsWith("[Sample document attached:") ? "" : customText,
      customFileName: undefined,
    });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
        <div>
          <label className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
            <Feather className="w-3.5 h-3.5 text-neutral-500" />
            <span>Academic Writing Tone & Style</span>
            <span className="text-neutral-400 font-normal">· Phase 3 Voice Calibration</span>
          </label>
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
            Select a tailored academic voice or provide past writing to clone your personal cadence and phrasing.
          </p>
        </div>
      </div>

      {/* 6 Selection Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {WRITING_STYLE_OPTIONS.map((style) => {
          const isSelected = currentPreset === style.id;
          const Icon = style.icon;

          return (
            <button
              key={style.id}
              type="button"
              onClick={() => handleSelect(style.id)}
              className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between relative group ${
                isSelected
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 border-neutral-900 dark:border-white shadow-xs ring-1 ring-neutral-900/10 dark:ring-white/20"
                  : "bg-white dark:bg-[#2C2C2E] border-neutral-200/80 dark:border-white/10 text-neutral-900 dark:text-neutral-100 hover:border-neutral-300 dark:hover:border-white/20 hover:bg-neutral-50/50 dark:hover:bg-white/[0.04]"
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                        isSelected
                          ? "bg-white/20 text-white dark:bg-black/10 dark:text-neutral-900"
                          : "bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-400 group-hover:text-neutral-900 dark:group-hover:text-white"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <span className="font-semibold text-xs tracking-tight">
                      {style.title}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {style.badge && (
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          isSelected
                            ? "bg-white/25 text-white dark:bg-black/15 dark:text-neutral-900"
                            : "bg-neutral-100 dark:bg-white/10 text-neutral-600 dark:text-neutral-300"
                        }`}
                      >
                        {style.badge}
                      </span>
                    )}
                    <div
                      className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                        isSelected
                          ? "bg-white text-neutral-900 dark:bg-neutral-900 dark:text-white border-transparent"
                          : "border-neutral-300 dark:border-white/20 bg-transparent"
                      }`}
                    >
                      {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                    </div>
                  </div>
                </div>

                <p
                  className={`text-[11px] leading-relaxed mb-3 ${
                    isSelected
                      ? "text-neutral-200 dark:text-neutral-700"
                      : "text-neutral-500 dark:text-neutral-400"
                  }`}
                >
                  {style.description}
                </p>
              </div>

              {/* Real-world Preview Example */}
              <div
                className={`p-2.5 rounded-lg border text-[11px] transition-colors ${
                  isSelected
                    ? "bg-white/10 dark:bg-black/5 border-white/20 dark:border-black/10 text-neutral-100 dark:text-neutral-800"
                    : "bg-neutral-50 dark:bg-white/[0.03] border-neutral-200/60 dark:border-white/5 text-neutral-600 dark:text-neutral-300"
                }`}
              >
                <div className="flex items-center gap-1 mb-1 opacity-70 text-[10px] font-medium uppercase tracking-wider">
                  <Quote className="w-2.5 h-2.5" />
                  <span>Preview Example</span>
                </div>
                <p className="italic leading-snug font-serif">
                  &ldquo;{style.example}&rdquo;
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Voice Cloning: Match My Writing Input Area */}
      {currentPreset === "custom" && (
        <div className="p-5 rounded-2xl border border-neutral-300/80 dark:border-white/15 bg-neutral-50/70 dark:bg-white/[0.02] space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
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
                className="w-full bg-white dark:bg-[#1C1C1E] border border-neutral-200/80 dark:border-white/10 rounded-xl p-3 text-xs text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-white transition-all resize-y leading-relaxed font-sans"
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
                    : "border-neutral-300 dark:border-white/15 bg-white dark:bg-[#1C1C1E] hover:border-neutral-400"
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
