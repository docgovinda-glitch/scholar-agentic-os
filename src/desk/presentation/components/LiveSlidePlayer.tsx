import React, { useState, useEffect, useCallback } from "react";
import type { PresentationProjectData, PresentationSlide } from "../types";
import SpeakerRehearsalTimer from "./SpeakerRehearsalTimer";

export interface LiveSlidePlayerProps {
  deckData: PresentationProjectData;
  initialSlideIndex?: number;
  onClose: () => void;
}

export default function LiveSlidePlayer({
  deckData,
  initialSlideIndex = 0,
  onClose,
}: LiveSlidePlayerProps) {
  const [slideIndex, setSlideIndex] = useState(initialSlideIndex);
  const [isPresenterMode, setIsPresenterMode] = useState(false);

  const slides = deckData.slides || [];
  const currentSlide: PresentationSlide = slides[slideIndex] || slides[0];
  const nextSlide: PresentationSlide | undefined = slides[slideIndex + 1];

  const handleNext = useCallback(() => {
    setSlideIndex((idx) => Math.min(slides.length - 1, idx + 1));
  }, [slides.length]);

  const handlePrev = useCallback(() => {
    setSlideIndex((idx) => Math.max(0, idx - 1));
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
        e.preventDefault();
        handleNext();
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        handlePrev();
      } else if (e.key === "Escape") {
        onClose();
      } else if (e.key === "p" || e.key === "P") {
        setIsPresenterMode((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleNext, handlePrev, onClose]);

  if (!currentSlide) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950 text-white flex flex-col justify-between select-none overflow-hidden"
      data-testid="live-slide-player"
    >
      {/* Top Floating Control Bar */}
      <div className="h-12 px-6 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-3">
          <span className="font-bold text-sky-400 uppercase tracking-wider text-[11px]">
            {deckData.title}
          </span>
          <span className="text-slate-600">|</span>
          <span>
            Slide {slideIndex + 1} of {slides.length}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsPresenterMode(!isPresenterMode)}
            className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
              isPresenterMode
                ? "bg-sky-500/20 text-sky-400 border border-sky-500/40"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
            title="Toggle Presenter Mode (Press 'P')"
          >
            {isPresenterMode ? "🎙️ Presenter Mode (Active)" : "🖥️ Audience Mode"}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Exit Presentation (Esc)"
          >
            ✕ Exit (Esc)
          </button>
        </div>
      </div>

      {/* Main Slide Canvas */}
      <div className="flex-1 p-6 md:p-10 flex items-center justify-center overflow-hidden">
        {isPresenterMode ? (
          /* Presenter Split View: Current Slide + Next Slide & Notes & Timer */
          <div className="w-full h-full max-w-7xl grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            {/* Current Slide Display */}
            <div className="lg:col-span-7 aspect-video rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 p-8 flex flex-col justify-between border border-slate-700 shadow-2xl relative overflow-hidden">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-bold text-sky-400 uppercase tracking-wider">
                  Live Slide
                </span>
                <span>
                  {slideIndex + 1} / {slides.length}
                </span>
              </div>

              <div className="my-auto space-y-3">
                <h2 className="text-2xl font-black text-white leading-tight">
                  {currentSlide.title}
                </h2>
                {currentSlide.subtitle && (
                  <p className="text-sm text-sky-300 font-medium">{currentSlide.subtitle}</p>
                )}
                <div className="pt-2 space-y-1.5">
                  {currentSlide.keyPoints.map((pt, idx) => (
                    <div key={idx} className="flex items-center gap-2.5 text-xs text-slate-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0" />
                      <span>{pt}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between text-[10px] text-slate-400 pt-3 border-t border-slate-700/60">
                <span className="truncate max-w-xs">{deckData.title}</span>
                <span className="text-sky-400">{currentSlide.visualFocus}</span>
              </div>
            </div>

            {/* Presenter Notes & Next Slide Column */}
            <div className="lg:col-span-5 h-full flex flex-col gap-4 overflow-y-auto">
              {/* Live Rehearsal Timer */}
              <SpeakerRehearsalTimer
                currentSlide={currentSlide}
                slideIndex={slideIndex}
                totalSlides={slides.length}
                onNextSlide={handleNext}
                onPrevSlide={handlePrev}
                className="bg-slate-900 border-slate-800 text-white"
              />

              {/* Speaker Notes */}
              <div className="flex-1 p-4 rounded-2xl border border-slate-800 bg-slate-900 flex flex-col justify-between">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-sky-400 block mb-2">
                    🎙️ Speaker Notes
                  </span>
                  <p className="text-xs text-slate-200 leading-relaxed italic bg-slate-950/70 p-3 rounded-xl border border-slate-800">
                    "{currentSlide.speakerNotes || "No notes provided."}"
                  </p>
                </div>

                {nextSlide && (
                  <div className="mt-3 pt-3 border-t border-slate-800">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                      Up Next: Slide {slideIndex + 2}
                    </span>
                    <p className="text-xs text-slate-300 font-semibold truncate">
                      {nextSlide.title}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Audience Mode: Clean Full 16:9 Slide Canvas */
          <div
            className="w-full max-w-6xl aspect-video rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 p-10 md:p-14 flex flex-col justify-between border border-slate-700 shadow-2xl relative overflow-hidden"
            data-testid="audience-slide-canvas"
          >
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-bold text-sky-400 uppercase tracking-wider">
                {deckData.title}
              </span>
              <span>
                Slide {currentSlide.slideNumber} / {slides.length}
              </span>
            </div>

            <div className="my-auto space-y-4">
              <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight leading-snug">
                {currentSlide.title}
              </h1>
              {currentSlide.subtitle && (
                <p className="text-base md:text-lg text-slate-300 font-medium">
                  {currentSlide.subtitle}
                </p>
              )}

              <div className="pt-4 space-y-2.5">
                {currentSlide.keyPoints.map((pt, idx) => (
                  <div key={idx} className="flex items-center gap-3 text-sm md:text-base text-slate-200">
                    <span className="w-2.5 h-2.5 rounded-full bg-sky-400 shrink-0" />
                    <span>{pt}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-400 pt-4 border-t border-slate-700/60">
              <span className="truncate max-w-md">{deckData.targetAudience}</span>
              <span className="text-sky-400 font-medium">{currentSlide.visualFocus}</span>
            </div>
          </div>
        )}
      </div>

      {/* Slide Navigation Ribbon */}
      <div className="h-16 px-6 bg-slate-900/90 border-t border-slate-800 flex items-center justify-between gap-4 overflow-x-auto">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrev}
            disabled={slideIndex === 0}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-xs font-bold transition-all cursor-pointer"
          >
            ← Prev
          </button>
          <button
            type="button"
            onClick={handleNext}
            disabled={slideIndex === slides.length - 1}
            className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-600 disabled:opacity-30 text-slate-950 text-xs font-bold transition-all cursor-pointer"
          >
            Next →
          </button>
        </div>

        {/* Slide Thumbnail Ribbon */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-1">
          {slides.map((s, idx) => {
            const isSelected = idx === slideIndex;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => setSlideIndex(idx)}
                className={`px-3 py-1 rounded-md text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  isSelected
                    ? "bg-sky-500 text-slate-950 font-bold shadow-xs scale-105"
                    : "bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-700"
                }`}
              >
                {s.slideNumber}. {s.title.slice(0, 20)}…
              </button>
            );
          })}
        </div>

        <div className="text-[11px] text-slate-400 hidden sm:block">
          Use <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700">Space</kbd> or{" "}
          <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700">→</kbd> to advance
        </div>
      </div>
    </div>
  );
}
