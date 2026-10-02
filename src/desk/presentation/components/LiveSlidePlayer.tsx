import React, { useState, useEffect, useCallback } from "react";
import type { PresentationProjectData, PresentationSlide } from "../types";
import type { SlideTheme } from "../../../features/slides";
import SlideMotifGraphic from "../../../features/slides/components/SlideMotifGraphic";
import SpeakerRehearsalTimer from "./SpeakerRehearsalTimer";

export interface LiveSlidePlayerProps {
  deckData: PresentationProjectData;
  initialSlideIndex?: number;
  theme?: SlideTheme;
  onClose: () => void;
}

export default function LiveSlidePlayer({
  deckData,
  initialSlideIndex = 0,
  theme,
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
      className="fixed inset-0 z-50 bg-[#000000] text-[#ECECEC] flex flex-col justify-between select-none overflow-hidden font-sans"
      data-testid="live-slide-player"
    >
      {/* Top Floating Control Bar */}
      <div className="h-12 px-6 bg-[#171717]/90 backdrop-blur-md border-b border-[#262626] flex items-center justify-between text-xs text-[#9B9B9B]">
        <div className="flex items-center gap-3">
          <span className="font-bold text-[#ECECEC] uppercase tracking-wider text-[11px]">
            {deckData.title}
          </span>
          <span className="text-[#404040]">|</span>
          <span>
            Slide {slideIndex + 1} of {slides.length}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsPresenterMode(!isPresenterMode)}
            className={`px-3 py-1 rounded-full font-semibold transition-all cursor-pointer ${
              isPresenterMode
                ? "bg-white text-black border border-white"
                : "bg-[#262626] text-[#D4D4D4] hover:bg-[#333333]"
            }`}
            title="Toggle Presenter Mode (Press 'P')"
          >
            {isPresenterMode ? "🎙️ Presenter Mode (Active)" : "🖥️ Audience Mode"}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#9B9B9B] hover:text-white hover:bg-[#262626] transition-colors cursor-pointer"
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
            <div className="lg:col-span-7 aspect-video rounded-2xl bg-[#171717] p-8 flex flex-col justify-between border border-[#262626] shadow-2xl relative overflow-hidden">
              <div className="flex items-center justify-between text-xs text-[#9B9B9B]">
                <span className="font-bold text-[#ECECEC] uppercase tracking-wider">
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
                  <p className="text-sm text-[#A3A3A3] font-medium">{currentSlide.subtitle}</p>
                )}
                <div className="pt-2 space-y-1.5">
                  {currentSlide.keyPoints.map((pt, idx) => (
                    <div key={idx} className="flex items-center gap-2.5 text-xs text-[#D4D4D4]">
                      <span className="w-1.5 h-1.5 rounded-full bg-white shrink-0" />
                      <span>{pt}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between text-[10px] text-[#9B9B9B] pt-3 border-t border-[#262626]">
                <span className="truncate max-w-xs">{deckData.title}</span>
                <span className="text-[#ECECEC]">{currentSlide.visualFocus}</span>
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
                className="bg-[#171717] border-[#262626] text-white"
              />

              {/* Speaker Notes */}
              <div className="flex-1 p-4 rounded-2xl border border-[#262626] bg-[#171717] flex flex-col justify-between">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-[#ECECEC] block mb-2">
                    🎙️ Speaker Notes
                  </span>
                  <p className="text-xs text-[#D4D4D4] leading-relaxed italic bg-black/60 p-3 rounded-xl border border-[#262626]">
                    "{currentSlide.speakerNotes || "No notes provided."}"
                  </p>
                </div>

                {nextSlide && (
                  <div className="mt-3 pt-3 border-t border-[#262626]">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#9B9B9B] block mb-1">
                      Up Next: Slide {slideIndex + 2}
                    </span>
                    <p className="text-xs text-[#D4D4D4] font-semibold truncate">
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
            className={`w-full max-w-6xl aspect-video rounded-2xl p-10 md:p-14 flex flex-col justify-between border shadow-2xl relative overflow-hidden transition-all duration-300 ${
              theme
                ? `${theme.cardClass} ${theme.cardBorder}`
                : "bg-[#171717] border-[#262626]"
            }`}
            style={theme ? { background: theme.cardBg } : undefined}
            data-testid="audience-slide-canvas"
          >
            {/* Authentic Vector Motif Background Layer */}
            {theme && <SlideMotifGraphic motif={theme.visualMotif} theme={theme} />}

            <div className="relative z-10 flex items-center justify-between text-xs text-[#9B9B9B]">
              <div className="flex items-center gap-3">
                <span className="font-bold text-[#ECECEC] uppercase tracking-wider">
                  {deckData.title}
                </span>
                {theme?.headerStamp && (
                  <span className="font-mono text-[10px] uppercase tracking-widest opacity-70" style={{ color: theme.accent }}>
                    // {theme.headerStamp}
                  </span>
                )}
              </div>
              <span>
                Slide {currentSlide.slideNumber} / {slides.length}
              </span>
            </div>

            <div className="relative z-10 my-auto space-y-4">
              <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight leading-snug">
                {currentSlide.title}
              </h1>
              {currentSlide.subtitle && (
                <p className="text-base md:text-lg text-[#A3A3A3] font-medium">
                  {currentSlide.subtitle}
                </p>
              )}

              <div className="pt-4 space-y-2.5">
                {currentSlide.keyPoints.map((pt, idx) => (
                  <div key={idx} className="flex items-center gap-3 text-sm md:text-base text-[#D4D4D4]">
                    <span className="w-2.5 h-2.5 rounded-full bg-white shrink-0" />
                    <span>{pt}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative z-10 flex items-center justify-between text-xs text-[#9B9B9B] pt-4 border-t border-[#262626]">
              <span className="truncate max-w-md">{deckData.targetAudience}</span>
              <span className="text-[#ECECEC] font-medium">{currentSlide.visualFocus}</span>
            </div>
          </div>
        )}
      </div>

      {/* Slide Navigation Ribbon */}
      <div className="h-16 px-6 bg-[#171717]/95 border-t border-[#262626] flex items-center justify-between gap-4 overflow-x-auto">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrev}
            disabled={slideIndex === 0}
            className="px-4 py-2 rounded-full bg-[#262626] hover:bg-[#333333] disabled:opacity-30 text-xs font-semibold text-[#ECECEC] transition-all cursor-pointer"
          >
            ← Prev
          </button>
          <button
            type="button"
            onClick={handleNext}
            disabled={slideIndex === slides.length - 1}
            className="px-4 py-2 rounded-full bg-white hover:bg-[#E5E5E5] disabled:opacity-30 text-black text-xs font-bold transition-all cursor-pointer"
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
                className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  isSelected
                    ? "bg-white text-black font-bold shadow-xs scale-105"
                    : "bg-[#262626] text-[#9B9B9B] hover:text-white hover:bg-[#333333]"
                }`}
              >
                {s.slideNumber}. {s.title.slice(0, 20)}…
              </button>
            );
          })}
        </div>

        <div className="text-[11px] text-[#9B9B9B] hidden sm:block font-mono">
          Use <kbd className="px-1.5 py-0.5 rounded bg-[#262626] border border-[#404040]">Space</kbd> or{" "}
          <kbd className="px-1.5 py-0.5 rounded bg-[#262626] border border-[#404040]">→</kbd> to advance
        </div>
      </div>
    </div>
  );
}
