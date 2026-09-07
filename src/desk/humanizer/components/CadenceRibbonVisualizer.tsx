import React, { useMemo } from "react";

interface CadenceRibbonVisualizerProps {
  text: string;
  onSentenceClick?: (sentenceIndex: number) => void;
}

export default function CadenceRibbonVisualizer({
  text,
  onSentenceClick,
}: CadenceRibbonVisualizerProps) {
  const sentenceStats = useMemo(() => {
    if (!text || !text.trim()) return [];
    const raw = text.match(/[^.!?]+[.!?]+/g) || (text.trim() ? [text.trim()] : []);
    const sentences = raw.map((s) => s.trim()).filter((s) => s.length > 0);

    const counts = sentences.map((s) => s.split(/\s+/).filter(Boolean).length);
    const maxCount = Math.max(...counts, 30);

    return sentences.map((s, idx) => {
      const count = counts[idx];
      const prevCount = idx > 0 ? counts[idx - 1] : null;
      const isMonotonic = prevCount !== null && Math.abs(count - prevCount) <= 2 && count >= 12;

      return {
        index: idx,
        text: s,
        count,
        normalizedHeight: Math.min(100, Math.max(15, Math.round((count / maxCount) * 100))),
        isMonotonic,
      };
    });
  }, [text]);

  if (sentenceStats.length <= 1) return null;

  return (
    <div
      data-testid="cadence-ribbon-visualizer"
      className="p-4 rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] shadow-xs mb-6 space-y-2"
    >
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <span className="text-base">📊</span>
          <span className="font-bold text-[color:var(--text-primary)]">
            Sentence Cadence & Rhythm Ribbon
          </span>
          <span className="text-[11px] text-[color:var(--text-muted)]">
            ({sentenceStats.length} sentences)
          </span>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-[color:var(--text-muted)]">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[color:var(--accent)]" /> Varied Length
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-500" /> Monotonic / Uniform Run
          </span>
        </div>
      </div>

      {/* Bar Chart Ribbon */}
      <div className="flex items-end gap-1.5 h-16 pt-2 pb-1 overflow-x-auto">
        {sentenceStats.map((st) => (
          <div
            key={st.index}
            onClick={() => onSentenceClick?.(st.index)}
            className="flex-1 min-w-[14px] max-w-[28px] h-full flex flex-col justify-end items-center group relative cursor-pointer"
          >
            {/* Tooltip */}
            <div className="absolute bottom-full mb-1 hidden group-hover:flex flex-col items-center z-20 pointer-events-none">
              <div className="bg-slate-900 text-white text-[10px] rounded-md px-2 py-1 shadow-lg whitespace-nowrap max-w-xs truncate">
                Sentence #{st.index + 1}: {st.count} words
                {st.isMonotonic && " ⚠️ Uniform length"}
              </div>
            </div>

            {/* Bar */}
            <div
              className={`w-full rounded-t-md transition-all ${
                st.isMonotonic
                  ? "bg-amber-400 group-hover:bg-amber-500"
                  : "bg-[color:var(--accent)] group-hover:bg-[color:var(--accent-hover)]"
              }`}
              style={{ height: `${st.normalizedHeight}%` }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
