import React, { useState, useEffect, useRef } from "react";
import {
  Columns,
  Maximize2,
  X,
  Network,
  BarChart3,
  FileCode,
} from "lucide-react";

export type ResearchLayerType = "discovery" | "evidence" | "export";

export interface ResearchSplitCanvasProps {
  activeLayer: ResearchLayerType | null;
  onSelectLayer: (layer: ResearchLayerType) => void;
  onClose: () => void;
  children: React.ReactNode;
  canvasContent: React.ReactNode;
  layoutMode?: "split" | "modal";
  onLayoutModeChange?: (mode: "split" | "modal") => void;
}

export const ResearchSplitCanvas: React.FC<ResearchSplitCanvasProps> = ({
  activeLayer,
  onSelectLayer,
  onClose,
  children,
  canvasContent,
  layoutMode: controlledLayoutMode,
  onLayoutModeChange,
}) => {
  const [internalLayoutMode, setInternalLayoutMode] = useState<"split" | "modal">(() => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) return "modal";
    return "split";
  });

  const layoutMode = controlledLayoutMode ?? internalLayoutMode;

  const handleSetLayoutMode = (newMode: "split" | "modal") => {
    if (onLayoutModeChange) {
      onLayoutModeChange(newMode);
    } else {
      setInternalLayoutMode(newMode);
    }
  };

  const [splitPercent, setSplitPercent] = useState<number>(55);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Resize drag handling
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const relativeX = e.clientX - rect.left;
      const totalWidth = rect.width;
      if (totalWidth <= 0) return;

      // splitPercent is the canvas width (right pane)
      const chatWidth = relativeX;
      const canvasWidth = totalWidth - chatWidth;
      const rawPercent = (canvasWidth / totalWidth) * 100;
      // Clamp between 35% and 75%
      const clamped = Math.min(75, Math.max(35, Math.round(rawPercent)));
      setSplitPercent(clamped);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  if (!activeLayer) {
    return <>{children}</>;
  }

  // Split-Screen Layout (Side-by-side Chat & Research Canvas)
  if (layoutMode === "split") {
    return (
      <div
        ref={containerRef}
        data-testid="research-split-canvas-container"
        className="flex-1 w-full h-full min-h-0 flex flex-row overflow-hidden relative select-none"
      >
        {/* Left Pane: Chat Conversation Stream */}
        <div
          style={{ width: `${100 - splitPercent}%` }}
          className="h-full flex flex-col min-w-[320px] max-w-[calc(100%-380px)] border-r border-neutral-200 dark:border-white/10 overflow-hidden shrink-0 select-text bg-paper-cool dark:bg-ink-850"
        >
          {children}
        </div>

        {/* Center Draggable Resizer Bar */}
        <div
          onMouseDown={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDoubleClick={() => setSplitPercent(55)}
          title="Drag to resize split view (double-click to reset to 55%)"
          className="w-2 relative -mx-1 z-30 cursor-col-resize flex items-center justify-center hover:bg-indigo-500/30 active:bg-indigo-500/50 transition-colors group select-none"
        >
          <div className="w-1 h-8 rounded-full bg-neutral-300 dark:bg-neutral-700 group-hover:bg-indigo-500 group-active:bg-indigo-600 transition-colors" />
        </div>

        {/* Right Pane: Active Research Workspace Canvas */}
        <div
          style={{ width: `${splitPercent}%` }}
          className="h-full flex flex-col min-w-[380px] flex-1 overflow-hidden bg-white dark:bg-neutral-900 shadow-xl z-10 select-text"
        >
          {/* Canvas Sub-Header: Layer Switcher & View Controls */}
          <div className="flex items-center justify-between px-3 py-2 bg-neutral-100/90 dark:bg-neutral-900/90 border-b border-neutral-200 dark:border-white/10 shrink-0 gap-2">
            {/* Layer Switcher Tabs */}
            <div className="flex items-center gap-1 overflow-x-auto scholar-scrollbar text-xs">
              <button
                type="button"
                onClick={() => onSelectLayer("discovery")}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                  activeLayer === "discovery"
                    ? "bg-indigo-600 text-white shadow-2xs"
                    : "text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200/70 dark:hover:bg-white/10"
                }`}
                title="Layer B: Citation Graph & Snowball Sampling"
              >
                <Network className="w-3.5 h-3.5" />
                <span>Discovery Graph</span>
              </button>

              <button
                type="button"
                onClick={() => onSelectLayer("evidence")}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                  activeLayer === "evidence"
                    ? "bg-emerald-600 text-white shadow-2xs"
                    : "text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200/70 dark:hover:bg-white/10"
                }`}
                title="Layer C: Evidence Matrix & Meta-Analysis Forest Plot"
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>Evidence & Forest Plot</span>
              </button>

              <button
                type="button"
                onClick={() => onSelectLayer("export")}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                  activeLayer === "export"
                    ? "bg-purple-600 text-white shadow-2xs"
                    : "text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200/70 dark:hover:bg-white/10"
                }`}
                title="Layer D: LaTeX Project & Overleaf Export"
              >
                <FileCode className="w-3.5 h-3.5" />
                <span>LaTeX / Overleaf</span>
              </button>
            </div>

            {/* View Mode Controls: Full-Screen & Close */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => handleSetLayoutMode("modal")}
                className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-200/70 dark:hover:bg-white/10 transition-colors cursor-pointer"
                title="Expand to Full-Screen Modal"
                aria-label="Expand to Full Screen"
              >
                <Maximize2 className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-200/70 dark:hover:bg-white/10 transition-colors cursor-pointer"
                title="Close Canvas"
                aria-label="Close Canvas"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Active Canvas Body */}
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            {canvasContent}
          </div>
        </div>
      </div>
    );
  }

  // Full-Screen Modal Overlay Layout
  return (
    <>
      {children}
      <div
        data-testid="research-modal-overlay"
        className="fixed inset-0 z-50 bg-neutral-950/80 backdrop-blur-xs flex flex-col p-2 md:p-6 animate-in fade-in"
      >
        <div className="flex-1 rounded-2xl overflow-hidden shadow-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-900 flex flex-col">
          {/* Modal Top Dock Bar */}
          <div className="flex items-center justify-between px-4 py-2 bg-neutral-100/90 dark:bg-neutral-900/90 border-b border-neutral-200 dark:border-white/10 shrink-0 gap-2">
            {/* Layer Switcher Tabs */}
            <div className="flex items-center gap-1 overflow-x-auto scholar-scrollbar text-xs">
              <button
                type="button"
                onClick={() => onSelectLayer("discovery")}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                  activeLayer === "discovery"
                    ? "bg-indigo-600 text-white shadow-2xs"
                    : "text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200/70 dark:hover:bg-white/10"
                }`}
              >
                <Network className="w-3.5 h-3.5" />
                <span>Discovery Graph</span>
              </button>

              <button
                type="button"
                onClick={() => onSelectLayer("evidence")}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                  activeLayer === "evidence"
                    ? "bg-emerald-600 text-white shadow-2xs"
                    : "text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200/70 dark:hover:bg-white/10"
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>Evidence & Forest Plot</span>
              </button>

              <button
                type="button"
                onClick={() => onSelectLayer("export")}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                  activeLayer === "export"
                    ? "bg-purple-600 text-white shadow-2xs"
                    : "text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200/70 dark:hover:bg-white/10"
                }`}
              >
                <FileCode className="w-3.5 h-3.5" />
                <span>LaTeX / Overleaf</span>
              </button>
            </div>

            {/* View Mode Controls: Dock Side-by-Side & Close */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => handleSetLayoutMode("split")}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-neutral-700 dark:text-neutral-300 bg-neutral-200/70 dark:bg-white/10 hover:bg-neutral-300/70 dark:hover:bg-white/15 transition-colors cursor-pointer"
                title="Dock Side-by-Side (Split Screen View)"
              >
                <Columns className="w-3.5 h-3.5 text-indigo-500" />
                <span className="hidden sm:inline">Split View</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-200/70 dark:hover:bg-white/10 transition-colors cursor-pointer"
                title="Close Modal"
                aria-label="Close Modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            {canvasContent}
          </div>
        </div>
      </div>
    </>
  );
};

export default ResearchSplitCanvas;
