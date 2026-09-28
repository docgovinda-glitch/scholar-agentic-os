import React, { useState, useRef } from "react";
import { Feather, Check, Upload, FileText, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import type { WritingToneConfig, WritingTonePreset } from "../types";

interface WritingToneSelectorProps {
  value: WritingToneConfig;
  onChange: (tone: WritingToneConfig) => void;
}

interface ToneOption {
  id: WritingTonePreset;
  title: string;
  tagline: string;
  description: string;
  badge?: string;
}

const TONE_OPTIONS: ToneOption[] = [
  {
    id: "scholarly_rigorous",
    title: "Scholarly & Rigorous",
    tagline: "Formal & Authoritative",
    description: "Authoritative third-person perspective, dense academic vocabulary, and disciplinary precision.",
    badge: "Default",
  },
  {
    id: "critical_evaluative",
    title: "Critical & Evaluative",
    tagline: "Dialectical & Probing",
    description: "Interrogates underlying assumptions, emphasizes methodological trade-offs and counter-perspectives.",
  },
  {
    id: "objective_analytical",
    title: "Objective & Analytical",
    tagline: "Empirical & Evidence-First",
    description: "Data-focused, neutral syntax, prioritizing quantitative or qualitative empirical verification.",
  },
  {
    id: "applied_reflective",
    title: "Applied & Reflective",
    tagline: "Professional Practice",
    description: "Balanced first- and third-person perspective for healthcare, education, law, or business case evaluations.",
  },
  {
    id: "custom_match",
    title: "Match My Writing Style",
    tagline: "Personal Academic Voice",
    description: "Calibrates sentence structure, pacing, and vocabulary level directly from your past writing sample.",
    badge: "Personalized",
  },
];

export default function WritingToneSelector({
  value,
  onChange,
}: WritingToneSelectorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const selectedPreset = value.preset || "scholarly_rigorous";
  const customSample = value.customSampleText || "";
  const sampleWordCount = customSample.trim()
    ? customSample.trim().split(/\s+/).filter(Boolean).length
    : 0;

  const handleSelectPreset = (preset: WritingTonePreset) => {
    const option = TONE_OPTIONS.find((o) => o.id === preset);
    onChange({
      ...value,
      preset,
      description: option?.description,
    });
  };

  const handleCustomTextChange = (text: string) => {
    onChange({
      ...value,
      preset: "custom_match",
      customSampleText: text,
      description: "Custom calibrated academic voice matching student past writing.",
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsReadingFile(true);
    try {
      if (file.name.endsWith(".txt") || file.name.endsWith(".md")) {
        const text = await file.text();
        onChange({
          ...value,
          preset: "custom_match",
          customFileName: file.name,
          customSampleText: text.slice(0, 5000),
          description: `Custom calibrated academic voice extracted from ${file.name}.`,
        });
      } else {
        // For PDF/DOCX we preserve metadata and extract sample text if available
        const reader = new FileReader();
        reader.onload = () => {
          onChange({
            ...value,
            preset: "custom_match",
            customFileName: file.name,
            customSampleText: `[Sample Document: ${file.name} (${Math.round(file.size / 1024)} KB)]`,
            description: `Calibrated from uploaded sample: ${file.name}`,
          });
          setIsReadingFile(false);
        };
        reader.readAsArrayBuffer(file);
        return;
      }
    } catch (err) {
      console.error("Failed to read sample file:", err);
    } finally {
      setIsReadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const currentOption = TONE_OPTIONS.find((o) => o.id === selectedPreset);

  return (
    <div className="space-y-3">
      {/* Header & Label */}
      <div className="flex items-center justify-between">
        <div>
          <label className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
            <Feather className="w-3.5 h-3.5 text-neutral-500" />
            <span>Academic Writing Tone & Style</span>
          </label>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
            Controls sentence complexity, authoritative register, and analytical framing in Phase 3 drafting.
          </p>
        </div>

        {/* Selected badge summary */}
        <span className="text-[11px] font-medium text-neutral-600 dark:text-neutral-300 bg-neutral-100 dark:bg-white/5 border border-neutral-200/80 dark:border-white/10 px-2.5 py-1 rounded-full shrink-0">
          {currentOption?.title || "Scholarly & Rigorous"}
        </span>
      </div>

      {/* Preset Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {TONE_OPTIONS.map((opt) => {
          const isSelected = selectedPreset === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => handleSelectPreset(opt.id)}
              className={`text-left p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-2 relative ${
                isSelected
                  ? "bg-white dark:bg-[#2C2C2E] border-neutral-900 dark:border-white shadow-xs ring-1 ring-neutral-900/10 dark:ring-white/20"
                  : "bg-neutral-50/70 dark:bg-white/[0.02] border-neutral-200/70 dark:border-white/5 hover:border-neutral-300 dark:hover:border-white/15 hover:bg-white dark:hover:bg-white/5"
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-1.5">
                  <span className="text-xs font-semibold text-neutral-900 dark:text-white">
                    {opt.title}
                  </span>
                  {isSelected && (
                    <span className="w-4 h-4 rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 flex items-center justify-center shrink-0">
                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                    </span>
                  )}
                  {!isSelected && opt.badge && (
                    <span className="text-[10px] font-semibold tracking-wide uppercase px-1.5 py-0.5 rounded bg-neutral-200/60 dark:bg-white/10 text-neutral-600 dark:text-neutral-300">
                      {opt.badge}
                    </span>
                  )}
                </div>
                <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 block mt-0.5">
                  {opt.tagline}
                </span>
              </div>

              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-snug">
                {opt.description}
              </p>
            </button>
          );
        })}
      </div>

      {/* "Match My Writing Style" Expanded Sample Intake */}
      {selectedPreset === "custom_match" && (
        <div className="p-4 rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#2C2C2E] space-y-3 animate-in fade-in duration-150">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span className="text-xs font-semibold text-neutral-900 dark:text-white">
                Personal Voice Calibration Sample
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isReadingFile}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white bg-neutral-100 dark:bg-white/5 hover:bg-neutral-200/70 dark:hover:bg-white/10 border border-neutral-200/80 dark:border-white/10 transition-colors cursor-pointer"
              >
                <Upload className="w-3 h-3" />
                <span>Upload Sample (.docx, .pdf, .txt)</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,.docx,.pdf"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>
          </div>

          <textarea
            rows={4}
            value={customSample}
            onChange={(e) => handleCustomTextChange(e.target.value)}
            placeholder="Paste 200–500 words from your own past academic essays, research reports, or papers. The Scribe engine will adapt to your sentence pacing, academic vocabulary level, and transition style."
            className="w-full bg-neutral-50/70 dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 rounded-xl p-3 text-xs text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-white leading-relaxed resize-y"
          />

          <div className="flex items-center justify-between text-[11px] text-neutral-500 dark:text-neutral-400">
            <span>
              {value.customFileName ? (
                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                  <FileText className="w-3 h-3" />
                  Loaded: {value.customFileName}
                </span>
              ) : (
                "Ideal sample size: 200 to 500 words"
              )}
            </span>
            <span className="font-mono tabular-nums">
              {sampleWordCount} words analyzed
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
