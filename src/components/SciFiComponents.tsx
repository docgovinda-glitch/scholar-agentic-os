/**
 * Sci-Fi UI Component Library
 *
 * Reusable components for the Phase 1 redesign:
 * - Spinner (loading indicator)
 * - Phase indicator ring
 * - Glassmorphic containers
 * - Progress indicator
 * - Status pulse
 * - Loading skeleton
 */

import React from "react";

/**
 * Spinner — animated loading indicator with pulsing gradient
 */
export function Spinner({ size = 32, message }: { size?: number; message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3">
      <div className="spinner" style={{ width: size, height: size }} />
      {message && <p className="text-sm text-slate-400 animate-pulse">{message}</p>}
    </div>
  );
}

/**
 * Phase Indicator Ring — animated ring showing current phase with glow
 */
export function PhaseIndicator({ phase, label }: { phase: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="phase-ring" title={`Phase ${phase}: ${label}`}>
        {phase}
      </div>
      <p className="phase-label text-xs">{label}</p>
    </div>
  );
}

/**
 * Glassmorphic Card — frosted glass effect container
 */
export function GlassmorphicCard({
  children,
  className = "",
  hover = true,
  glow = false
}: {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  glow?: boolean;
}) {
  return (
    <div
      className={`glassmorphic ${glow ? "border-glow-pulse" : ""} ${hover ? "hover:border-opacity-100 transition-all" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * Progress Bar — linear gradient progress indicator with glow
 */
export function ProgressBar({ progress, label }: { progress: number; label?: string }) {
  const clampedProgress = Math.max(0, Math.min(100, progress));

  return (
    <div className="flex flex-col gap-2">
      {label && <p className="text-xs font-mono text-slate-400">{label}</p>}
      <div className="w-full h-1 bg-navy-2 rounded-full overflow-hidden">
        <div
          className="progress-bar h-full"
          style={{
            width: `${clampedProgress}%`,
            transition: "width 0.3s ease-out"
          }}
        />
      </div>
      <p className="text-xs text-slate-500 text-right font-mono">{clampedProgress}%</p>
    </div>
  );
}

/**
 * Status Indicator — pulsing colored dot with status text
 */
export function StatusIndicator({
  status,
  label
}: {
  status: "idle" | "processing" | "success" | "warning" | "error";
  label: string;
}) {
  const statusColors = {
    idle: "bg-slate-500",
    processing: "bg-blue-500 status-pulse",
    success: "bg-green-500",
    warning: "bg-amber-500",
    error: "bg-red-500"
  };

  const statusLabels = {
    idle: "Ready",
    processing: "Processing",
    success: "Done",
    warning: "Warning",
    error: "Error"
  };

  return (
    <div className="flex items-center gap-2">
      <div className={`w-2.5 h-2.5 rounded-full ${statusColors[status]}`} />
      <p className="text-xs font-mono text-slate-400">
        {label || statusLabels[status]}
      </p>
    </div>
  );
}

/**
 * Loading Skeleton — shimmer effect for placeholder content
 */
export function LoadingSkeleton({ count = 1 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-4 rounded-lg skeleton-shimmer" />
      ))}
    </div>
  );
}

/**
 * Processing Overlay — full-screen loading state with message
 */
export function ProcessingOverlay({
  message = "Processing...",
  submessage
}: {
  message?: string;
  submessage?: string;
}) {
  return (
    <div className="fixed inset-0 bg-navy-0/80 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="text-center space-y-4">
        <Spinner size={48} />
        <div>
          <h3 className="text-lg font-mono font-semibold text-luminous-blue">
            {message}
          </h3>
          {submessage && (
            <p className="text-sm text-slate-400 mt-2">{submessage}</p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Neon Button — interactive button with glow effect
 */
export function NeonButton({
  children,
  onClick,
  variant = "primary",
  loading = false,
  disabled = false,
  className = ""
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary";
  loading?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const baseStyles =
    "px-4 py-2 rounded-lg font-mono text-sm font-semibold transition-all duration-200";

  const variants = {
    primary: "bg-luminous-blue text-navy-0 hover:shadow-lg hover:shadow-luminous-blue/50",
    secondary:
      "bg-navy-3 border border-luminous-blue text-luminous-blue hover:bg-navy-2"
  };

  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      className={`${baseStyles} ${variants[variant]} ${loading ? "opacity-70 cursor-wait" : ""} ${className}`}
    >
      {loading ? (
        <span className="flex items-center gap-2">
          <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
          Loading...
        </span>
      ) : (
        children
      )}
    </button>
  );
}

/**
 * Glow Box — container with subtle glow border
 */
export function GlowBox({
  children,
  className = "",
  intense = false
}: {
  children: React.ReactNode;
  className?: string;
  intense?: boolean;
}) {
  return (
    <div
      className={`border border-luminous-blue/30 rounded-lg ${intense ? "border-glow" : ""} bg-navy-1/40 p-4 ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * Phase Badge — small indicator of current phase
 */
export function PhaseBadge({
  phase,
  className = ""
}: {
  phase: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-luminous-blue/10 border border-luminous-blue/20 text-xs font-mono font-semibold text-luminous-blue ${className}`}
    >
      <span className="w-1.5 h-1.5 bg-luminous-blue rounded-full" />
      Phase {phase}
    </span>
  );
}
