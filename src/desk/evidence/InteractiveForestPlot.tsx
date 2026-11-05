import React, { useMemo, useState } from "react";
import {
  BarChart3,
  Download,
  AlertTriangle,
  Info,
  CheckCircle,
  Layers,
  FileSpreadsheet,
} from "lucide-react";
import {
  type EvidenceMatrixItem,
  type MetaAnalysisResult,
  calculateMetaAnalysis,
} from "../../services/evidence/evidenceExtractionService";

export interface InteractiveForestPlotProps {
  items: EvidenceMatrixItem[];
  title?: string;
  className?: string;
}

export default function InteractiveForestPlot({
  items,
  title = "Meta-Analytic Forest Plot & Empirical Evidence Pooling",
  className = "",
}: InteractiveForestPlotProps) {
  const [model, setModel] = useState<"fixed" | "random">("random");

  // Filter to quantitative items only for forest plot
  const quantitativeItems = useMemo(() => {
    return items.filter((it) => typeof it.effectSize === "number" && it.effectMetric !== "Qualitative");
  }, [items]);

  // Compute meta-analysis
  const meta: MetaAnalysisResult = useMemo(() => {
    return calculateMetaAnalysis(quantitativeItems, model);
  }, [quantitativeItems, model]);

  const isRatio = meta.metricType === "Odds Ratio" || meta.metricType === "Relative Risk" || meta.metricType === "Hazard Ratio";
  const nullEffectValue = isRatio ? 1.0 : 0.0;

  // Compute X-axis domain
  const { minVal, maxVal } = useMemo(() => {
    if (quantitativeItems.length === 0) return { minVal: -1, maxVal: 1 };

    let min = nullEffectValue;
    let max = nullEffectValue;

    for (const it of quantitativeItems) {
      if (typeof it.ciLower === "number") min = Math.min(min, it.ciLower);
      if (typeof it.ciUpper === "number") max = Math.max(max, it.ciUpper);
      if (typeof it.effectSize === "number") {
        min = Math.min(min, it.effectSize);
        max = Math.max(max, it.effectSize);
      }
    }

    if (meta.isPoolable) {
      min = Math.min(min, meta.ciLower);
      max = Math.max(max, meta.ciUpper);
    }

    if (isRatio) {
      const padMin = Math.max(0.1, min * 0.7);
      const padMax = max * 1.3;
      return { minVal: padMin, maxVal: padMax };
    } else {
      const span = Math.max(1.0, max - min);
      return { minVal: min - span * 0.18, maxVal: max + span * 0.18 };
    }
  }, [quantitativeItems, meta, nullEffectValue, isRatio]);

  // Plot Layout Dimensions
  const plotWidth = 760;
  const rowHeight = 36;
  const headerHeight = 44;
  const diamondRowHeight = meta.isPoolable ? 44 : 0;
  const plotHeight = headerHeight + quantitativeItems.length * rowHeight + diamondRowHeight + 50;

  const leftMargin = 220; // For study labels
  const rightMargin = 200; // For statistics (estimate, 95% CI, weight)
  const forestWidth = plotWidth - leftMargin - rightMargin;

  // Scale function mapping value to X coordinate in SVG
  const scaleX = (val: number): number => {
    if (isRatio) {
      const logMin = Math.log(Math.max(0.01, minVal));
      const logMax = Math.log(Math.max(0.02, maxVal));
      const logVal = Math.log(Math.max(0.01, val));
      const pct = (logVal - logMin) / (logMax - logMin || 1);
      return leftMargin + pct * forestWidth;
    } else {
      const pct = (val - minVal) / (maxVal - minVal || 1);
      return leftMargin + pct * forestWidth;
    }
  };

  const nullEffectX = scaleX(nullEffectValue);

  // Export SVG handler
  const handleExportSvg = () => {
    const svgEl = document.getElementById("scholar-forest-plot-svg");
    if (!svgEl) return;
    const svgData = new XMLSerializer().serializeToString(svgEl);
    const blob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `forest_plot_${Date.now()}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export CSV handler
  const handleExportCsv = () => {
    let csv = "Study,Year,Design,N,Metric,Estimate,95% CI Lower,95% CI Upper,p-value,Weight %\n";
    for (const it of quantitativeItems) {
      const rawAuthor = it.authors[0] || "Author";
      const surname = rawAuthor.includes(",") ? rawAuthor.split(",")[0].trim() : rawAuthor.split(" ").pop()?.trim() || "Author";
      const weight = meta.studyWeights[it.id] ?? 0;
      csv += `"${surname} (${it.year || "n.d."})",${it.year || ""},"${it.studyDesign}",${it.sampleSizeTotal || ""},"${it.effectMetric}",${it.effectSize || ""},${it.ciLower || ""},${it.ciUpper || ""},${it.pValue || ""},${weight}\n`;
    }
    if (meta.isPoolable) {
      csv += `"Pooled Summary (${model.toUpperCase()})",,,"${meta.totalSampleSize}","${meta.metricType}",${meta.pooledEffect},${meta.ciLower},${meta.ciUpper},${meta.pValue},100%\n`;
    }

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `forest_plot_data_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (items.length === 0) {
    return (
      <div className="p-8 text-center border border-dashed border-neutral-300 dark:border-white/10 rounded-2xl bg-neutral-50 dark:bg-white/[0.01]">
        <BarChart3 className="w-8 h-8 text-neutral-400 mx-auto mb-2" />
        <h4 className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
          No Empirical Studies Available for Forest Plot
        </h4>
        <p className="text-[11px] text-neutral-500 mt-1 max-w-sm mx-auto">
          Add or extract quantitative empirical studies from discovered literature to generate interactive forest plots and calculate heterogeneity.
        </p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-white/10 shadow-sm overflow-hidden ${className}`}>
      {/* Top Toolbar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-200 dark:border-white/10 bg-neutral-50/70 dark:bg-white/[0.02] gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
            <BarChart3 className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-neutral-900 dark:text-white leading-none">
              {title}
            </h3>
            <p className="text-[10.5px] text-neutral-500 dark:text-neutral-400 mt-0.5">
              Inverse-Variance Weighting · Null Line ({nullEffectValue}) · Metric: {meta.metricType}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Model Toggle: Fixed vs Random Effects */}
          <div className="flex items-center rounded-lg border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-800 p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => setModel("fixed")}
              className={`px-2 py-0.5 rounded font-medium transition-colors ${
                model === "fixed"
                  ? "bg-indigo-600 text-white font-semibold"
                  : "text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
              }`}
            >
              Fixed-Effect
            </button>
            <button
              type="button"
              onClick={() => setModel("random")}
              className={`px-2 py-0.5 rounded font-medium transition-colors ${
                model === "random"
                  ? "bg-indigo-600 text-white font-semibold"
                  : "text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
              }`}
            >
              Random-Effects (D-L)
            </button>
          </div>

          {/* Export Actions */}
          <button
            type="button"
            onClick={handleExportSvg}
            className="px-2.5 py-1 rounded-lg text-xs font-medium border border-neutral-200 dark:border-white/10 hover:bg-neutral-100 dark:hover:bg-white/5 text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Export high-resolution vector SVG"
          >
            <Download className="w-3 h-3 text-neutral-500" />
            <span>SVG</span>
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            className="px-2.5 py-1 rounded-lg text-xs font-medium border border-neutral-200 dark:border-white/10 hover:bg-neutral-100 dark:hover:bg-white/5 text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Export statistical data table as CSV"
          >
            <FileSpreadsheet className="w-3 h-3 text-emerald-500" />
            <span>CSV</span>
          </button>
        </div>
      </div>

      {/* Safeguard Warnings Banner */}
      {!meta.isPoolable && meta.incompatibilityReason && (
        <div className="px-5 py-2.5 bg-amber-500/10 border-b border-amber-500/20 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Methodological Safeguard Active: </span>
            <span>{meta.incompatibilityReason}</span>
          </div>
        </div>
      )}

      {meta.warningMessage && (
        <div className="px-5 py-2 bg-rose-500/10 border-b border-rose-500/20 text-xs text-rose-800 dark:text-rose-300 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
          <span>{meta.warningMessage}</span>
        </div>
      )}

      {/* Forest Plot SVG Canvas */}
      <div className="overflow-x-auto p-4 scholar-scrollbar flex justify-center bg-white dark:bg-neutral-900">
        <svg
          id="scholar-forest-plot-svg"
          viewBox={`0 0 ${plotWidth} ${plotHeight}`}
          className="w-full max-w-[760px] h-auto select-none"
        >
          {/* Header Row */}
          <text
            x={10}
            y={24}
            className="text-[11px] font-bold fill-neutral-700 dark:fill-neutral-300"
          >
            Study & Design
          </text>
          <text
            x={nullEffectX}
            y={14}
            textAnchor="middle"
            className="text-[10px] font-bold fill-neutral-500 dark:fill-neutral-400"
          >
            Null Effect ({nullEffectValue})
          </text>
          <text
            x={leftMargin + 10}
            y={28}
            className="text-[9px] font-mono fill-neutral-400 pointer-events-none"
          >
            ◀ Favours Control
          </text>
          <text
            x={leftMargin + forestWidth - 10}
            y={28}
            textAnchor="end"
            className="text-[9px] font-mono fill-neutral-400 pointer-events-none"
          >
            Favours Intervention ▶
          </text>
          <text
            x={plotWidth - 10}
            y={24}
            textAnchor="end"
            className="text-[11px] font-bold fill-neutral-700 dark:fill-neutral-300"
          >
            Estimate [95% CI] (Weight)
          </text>

          {/* Header Line */}
          <line
            x1={10}
            y1={headerHeight - 6}
            x2={plotWidth - 10}
            y2={headerHeight - 6}
            className="stroke-neutral-300 dark:stroke-white/10"
            strokeWidth={1.2}
          />

          {/* Vertical Null Effect Line */}
          <line
            x1={nullEffectX}
            y1={headerHeight}
            x2={nullEffectX}
            y2={headerHeight + quantitativeItems.length * rowHeight + diamondRowHeight + 10}
            stroke="#94a3b8"
            strokeWidth={1.5}
            strokeDasharray="4 3"
          />

          {/* Individual Study Rows */}
          {quantitativeItems.map((item, idx) => {
            const y = headerHeight + idx * rowHeight + rowHeight / 2;
            const rawAuthor = item.authors[0] || "Author";
            const surname = rawAuthor.includes(",") ? rawAuthor.split(",")[0].trim() : rawAuthor.split(" ").pop()?.trim() || "Author";
            const studyLabel = `${surname} (${item.year || "n.d."})`;
            const weight = meta.studyWeights[item.id] ?? 0;

            const pointX = typeof item.effectSize === "number" ? scaleX(item.effectSize) : nullEffectX;
            const ciLowerX = typeof item.ciLower === "number" ? scaleX(item.ciLower) : pointX - 20;
            const ciUpperX = typeof item.ciUpper === "number" ? scaleX(item.ciUpper) : pointX + 20;

            // Box size proportional to study weight
            const boxSize = Math.max(6, Math.min(18, 6 + (weight / 100) * 20));

            return (
              <g key={item.id} className="group">
                {/* Row Hover Background */}
                <rect
                  x={8}
                  y={y - rowHeight / 2 + 2}
                  width={plotWidth - 16}
                  height={rowHeight - 4}
                  className="fill-transparent group-hover:fill-neutral-50 dark:group-hover:fill-white/[0.02] transition-colors"
                  rx={6}
                />

                {/* Left Column: Study Label and Design */}
                <text
                  x={12}
                  y={y - 1}
                  className="text-[11px] font-semibold fill-neutral-900 dark:fill-neutral-100"
                >
                  {studyLabel}
                </text>
                <text
                  x={12}
                  y={y + 11}
                  className="text-[9.5px] fill-neutral-500 dark:fill-neutral-400"
                >
                  {item.studyDesign} · N = {item.sampleSizeTotal?.toLocaleString() || "---"}
                </text>

                {/* Confidence Interval Whisker */}
                <line
                  x1={ciLowerX}
                  y1={y}
                  x2={ciUpperX}
                  y2={y}
                  stroke="#3b82f6"
                  strokeWidth={2}
                />
                {/* CI Whisker Left Cap */}
                <line
                  x1={ciLowerX}
                  y1={y - 4}
                  x2={ciLowerX}
                  y2={y + 4}
                  stroke="#3b82f6"
                  strokeWidth={1.5}
                />
                {/* CI Whisker Right Cap */}
                <line
                  x1={ciUpperX}
                  y1={y - 4}
                  x2={ciUpperX}
                  y2={y + 4}
                  stroke="#3b82f6"
                  strokeWidth={1.5}
                />

                {/* Point Estimate Square (Sized by weight) */}
                <rect
                  x={pointX - boxSize / 2}
                  y={y - boxSize / 2}
                  width={boxSize}
                  height={boxSize}
                  fill="#2563eb"
                  className="stroke-white dark:stroke-neutral-900 shadow-xs"
                  strokeWidth={1}
                />

                {/* Right Column: Estimate [95% CI] and Weight % */}
                <text
                  x={plotWidth - 12}
                  y={y + 3.5}
                  textAnchor="end"
                  className="text-[10.5px] font-mono fill-neutral-800 dark:fill-neutral-200 font-medium"
                >
                  {item.effectSize} [{item.ciLower}, {item.ciUpper}]
                  <tspan className="fill-neutral-400 font-normal"> ({weight}%)</tspan>
                </text>
              </g>
            );
          })}

          {/* Pooled Summary Diamond (when poolable) */}
          {meta.isPoolable && (
            <g>
              {/* Divider Line */}
              <line
                x1={10}
                y1={headerHeight + quantitativeItems.length * rowHeight + 4}
                x2={plotWidth - 10}
                y2={headerHeight + quantitativeItems.length * rowHeight + 4}
                className="stroke-neutral-300 dark:stroke-white/10"
                strokeWidth={1.5}
              />

              {(() => {
                const diamondY = headerHeight + quantitativeItems.length * rowHeight + diamondRowHeight / 2 + 4;
                const tipLeftX = scaleX(meta.ciLower);
                const tipRightX = scaleX(meta.ciUpper);
                const tipCenterX = scaleX(meta.pooledEffect);
                const halfH = 7;

                const points = `${tipLeftX},${diamondY} ${tipCenterX},${diamondY - halfH} ${tipRightX},${diamondY} ${tipCenterX},${diamondY + halfH}`;

                return (
                  <>
                    <text
                      x={12}
                      y={diamondY - 1}
                      className="text-[11px] font-bold fill-indigo-600 dark:fill-indigo-400"
                    >
                      Pooled Effect ({model === "random" ? "Random-Effects" : "Fixed-Effect"})
                    </text>
                    <text
                      x={12}
                      y={diamondY + 11}
                      className="text-[9.5px] font-medium fill-neutral-500 dark:fill-neutral-400"
                    >
                      Total N = {meta.totalSampleSize.toLocaleString()} · {meta.totalStudies} Studies
                    </text>

                    {/* Summary Diamond Polygon */}
                    <polygon
                      points={points}
                      fill="#6366f1"
                      stroke="#4338ca"
                      strokeWidth={1.5}
                      className="shadow-sm"
                    />

                    {/* Pooled Value Text on Right */}
                    <text
                      x={plotWidth - 12}
                      y={diamondY + 3.5}
                      textAnchor="end"
                      className="text-[11px] font-mono font-bold fill-indigo-600 dark:fill-indigo-400"
                    >
                      {meta.pooledEffect} [{meta.ciLower}, {meta.ciUpper}] (100.0%)
                    </text>
                  </>
                );
              })()}
            </g>
          )}

          {/* Bottom X-Axis Ticks & Values */}
          {(() => {
            const axisY = headerHeight + quantitativeItems.length * rowHeight + diamondRowHeight + 24;
            const ticks = isRatio
              ? [minVal, nullEffectValue, maxVal]
              : [minVal, (minVal + nullEffectValue) / 2, nullEffectValue, (nullEffectValue + maxVal) / 2, maxVal];

            return (
              <g>
                <line
                  x1={leftMargin}
                  y1={axisY}
                  x2={leftMargin + forestWidth}
                  y2={axisY}
                  className="stroke-neutral-400 dark:stroke-white/20"
                  strokeWidth={1}
                />
                {ticks.map((tVal, tIdx) => {
                  const tx = scaleX(tVal);
                  return (
                    <g key={tIdx}>
                      <line
                        x1={tx}
                        y1={axisY}
                        x2={tx}
                        y2={axisY + 4}
                        className="stroke-neutral-400 dark:stroke-white/20"
                        strokeWidth={1}
                      />
                      <text
                        x={tx}
                        y={axisY + 14}
                        textAnchor="middle"
                        className="text-[9.5px] font-mono fill-neutral-500 dark:fill-neutral-400"
                      >
                        {tVal.toFixed(1)}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })()}
        </svg>
      </div>

      {/* Statistical Summary Footer */}
      <div className="px-5 py-3 border-t border-neutral-200 dark:border-white/10 bg-neutral-50/80 dark:bg-neutral-800/50 flex items-center justify-between gap-4 text-xs flex-wrap">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <span className="text-neutral-500 dark:text-neutral-400">Total N: </span>
            <span className="font-semibold text-neutral-800 dark:text-neutral-200">
              {meta.totalSampleSize.toLocaleString()}
            </span>
          </div>

          <div>
            <span className="text-neutral-500 dark:text-neutral-400">Heterogeneity (I²): </span>
            <span className={`font-bold font-mono ${
              meta.heterogeneityLevel === "extreme"
                ? "text-rose-600 dark:text-rose-400"
                : meta.heterogeneityLevel === "substantial"
                ? "text-amber-600 dark:text-amber-400"
                : "text-emerald-600 dark:text-emerald-400"
            }`}>
              {meta.iSquared}% ({meta.heterogeneityLevel})
            </span>
          </div>

          <div>
            <span className="text-neutral-500 dark:text-neutral-400">Cochrane's Q: </span>
            <span className="font-semibold text-neutral-800 dark:text-neutral-200 font-mono">
              {meta.cochranesQ} (df = {meta.degreesOfFreedom}, p = {meta.qPValue < 0.001 ? "<0.001" : meta.qPValue})
            </span>
          </div>

          {meta.tauSquared > 0 && (
            <div>
              <span className="text-neutral-500 dark:text-neutral-400">τ²: </span>
              <span className="font-semibold text-neutral-800 dark:text-neutral-200 font-mono">
                {meta.tauSquared}
              </span>
            </div>
          )}
        </div>

        {meta.isPoolable && (
          <div className="flex items-center gap-2">
            <span className="text-neutral-500 dark:text-neutral-400">Test of Overall Effect: </span>
            <span className="font-bold text-indigo-600 dark:text-indigo-400 font-mono">
              Z = {meta.zValue} (p = {meta.pValue < 0.001 ? "<0.001" : meta.pValue})
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

