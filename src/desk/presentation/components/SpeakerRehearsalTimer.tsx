import React, { useState, useEffect, useMemo } from "react";
import type { PresentationSlide } from "../types";

export interface SpeakerRehearsalTimerProps {
  currentSlide: PresentationSlide;
  slideIndex: number;
  totalSlides: number;
  onNextSlide?: () => void;
  onPrevSlide?: () => void;
  className?: string;
}

export default function SpeakerRehearsalTimer({
  currentSlide,
  slideIndex,
  totalSlides,
  onNextSlide,
  onPrevSlide,
  className = "",
}: SpeakerRehearsalTimerProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [slideElapsedSeconds, setSlideElapsedSeconds] = useState(0);
  const [totalElapsedSeconds, setTotalElapsedSeconds] = useState(0);

  // Reset slide timer when slide index changes
  useEffect(() => {
    setSlideElapsedSeconds(0);
  }, [slideIndex]);

  // Timer interval
  useEffect(() => {
    let interval: any = null;
    if (isRunning) {
      interval = setInterval(() => {
        setSlideElapsedSeconds((s) => s + 1);
        setTotalElapsedSeconds((t) => t + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRunning]);

  const targetDuration = currentSlide.targetDurationSeconds || 60;
  const timeRemaining = Math.max(0, targetDuration - slideElapsedSeconds);
  const isOverTime = slideElapsedSeconds > targetDuration;
  const progressPercent = Math.min(100, Math.round((slideElapsedSeconds / targetDuration) * 100));

  // Word count & Words Per Minute (WPM)
  const wordCount = useMemo(() => {
    if (!currentSlide.speakerNotes) return 0;
    return currentSlide.speakerNotes.trim().split(/\s+/).filter(Boolean).length;
  }, [currentSlide.speakerNotes]);

  const estimatedTargetWpm = useMemo(() => {
    if (targetDuration <= 0) return 130;
    return Math.round((wordCount / (targetDuration / 60)));
  }, [wordCount, targetDuration]);

  const liveWpm = useMemo(() => {
    if (slideElapsedSeconds < 5) return estimatedTargetWpm;
    return Math.round((wordCount / (slideElapsedSeconds / 60)));
  }, [wordCount, slideElapsedSeconds, estimatedTargetWpm]);

  // Pace status
  const paceStatus = useMemo(() => {
    if (isOverTime) {
      return { label: "Over Slide Time Limit", color: "text-rose-500 bg-rose-500/15 border-rose-500/30" };
    }
    if (liveWpm > 165) {
      return { label: `Fast Delivery (~${liveWpm} WPM)`, color: "text-amber-500 bg-amber-500/15 border-amber-500/30" };
    }
    if (liveWpm < 110 && slideElapsedSeconds > 10) {
      return { label: `Deliberate / Slow (~${liveWpm} WPM)`, color: "text-sky-400 bg-sky-500/15 border-sky-500/30" };
    }
    return { label: `Optimal Scholarly Pacing (~${liveWpm} WPM)`, color: "text-emerald-400 bg-emerald-500/15 border-emerald-500/30" };
  }, [isOverTime, liveWpm, slideElapsedSeconds]);

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${mins}:${rem < 10 ? "0" : ""}${rem}`;
  };

  return (
    <div
      className={`p-4 rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] flex flex-col gap-3 shadow-xs ${className}`}
      data-testid="speaker-rehearsal-timer"
    >
      {/* Header & Mode Badges */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">🎙️</span>
          <span className="text-xs font-bold uppercase tracking-wider text-[color:var(--text-primary)]">
            Live Rehearsal & Speech Pacer
          </span>
        </div>
        <span
          className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${paceStatus.color}`}
          data-testid="pacer-status-badge"
        >
          {paceStatus.label}
        </span>
      </div>

      {/* Main Timer Display */}
      <div className="grid grid-cols-3 gap-2 bg-[color:var(--surface-sunken)] p-3 rounded-xl border border-[color:var(--border-subtle)] text-center">
        <div>
          <span className="text-[10px] text-[color:var(--text-muted)] font-semibold block mb-0.5">
            Slide Elapsed
          </span>
          <span
            className={`text-lg font-mono font-bold ${
              isOverTime ? "text-rose-500 animate-pulse" : "text-[color:var(--text-primary)]"
            }`}
          >
            {formatTime(slideElapsedSeconds)}
          </span>
          <span className="text-[10px] text-[color:var(--text-muted)] block mt-0.5">
            / {formatTime(targetDuration)}
          </span>
        </div>

        <div>
          <span className="text-[10px] text-[color:var(--text-muted)] font-semibold block mb-0.5">
            Slide Remaining
          </span>
          <span className="text-lg font-mono font-bold text-[color:var(--accent)]">
            {formatTime(timeRemaining)}
          </span>
          <span className="text-[10px] text-[color:var(--text-muted)] block mt-0.5">
            {progressPercent}% spent
          </span>
        </div>

        <div>
          <span className="text-[10px] text-[color:var(--text-muted)] font-semibold block mb-0.5">
            Total Talk Time
          </span>
          <span className="text-lg font-mono font-bold text-[color:var(--text-secondary)]">
            {formatTime(totalElapsedSeconds)}
          </span>
          <span className="text-[10px] text-[color:var(--text-muted)] block mt-0.5">
            Slide {slideIndex + 1}/{totalSlides}
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-[color:var(--surface-sunken)] h-2 rounded-full overflow-hidden border border-[color:var(--border-subtle)]">
        <div
          className={`h-full transition-all duration-300 ${
            isOverTime
              ? "bg-rose-500"
              : progressPercent > 80
              ? "bg-amber-500"
              : "bg-[color:var(--accent-solid)]"
          }`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setIsRunning(!isRunning)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs ${
              isRunning
                ? "bg-amber-500 hover:bg-amber-600 text-slate-950"
                : "bg-[color:var(--accent-solid)] hover:bg-[color:var(--accent-hover)] text-white"
            }`}
          >
            {isRunning ? "⏸ Pause Pacer" : "▶ Start Rehearsal"}
          </button>
          <button
            type="button"
            onClick={() => setSlideElapsedSeconds(0)}
            className="px-2.5 py-1.5 rounded-lg border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] text-xs font-semibold cursor-pointer"
            title="Reset this slide timer"
          >
            ↺ Reset Slide
          </button>
        </div>

        <div className="flex items-center gap-1">
          {onPrevSlide && (
            <button
              type="button"
              onClick={onPrevSlide}
              disabled={slideIndex === 0}
              className="px-2.5 py-1.5 rounded-lg border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] text-xs font-bold disabled:opacity-30 cursor-pointer"
            >
              ← Prev
            </button>
          )}
          {onNextSlide && (
            <button
              type="button"
              onClick={onNextSlide}
              disabled={slideIndex === totalSlides - 1}
              className="px-2.5 py-1.5 rounded-lg border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] text-xs font-bold disabled:opacity-30 cursor-pointer"
            >
              Next →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
