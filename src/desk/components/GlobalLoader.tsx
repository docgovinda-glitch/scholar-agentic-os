export default function GlobalLoader({
  message = "Loading Scholar Core...",
}: {
  message?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="min-h-[60vh] w-full flex flex-col items-center justify-center p-8 bg-ink-850 text-neutral-400 select-none"
    >
      <div className="w-full max-w-2xl mx-auto space-y-6 animate-pulse">
        {/* Header Skeleton */}
        <div className="flex items-center justify-between border-b border-white/5 pb-4">
          <div className="h-5 w-40 bg-white/10 rounded-md" />
          <div className="h-4 w-20 bg-white/5 rounded-md" />
        </div>

        {/* Content Skeleton Card */}
        <div className="p-6 rounded-2xl bg-ink-750 border border-white/5 space-y-4">
          <div className="h-4 w-3/4 bg-white/10 rounded-md" />
          <div className="space-y-2">
            <div className="h-3 w-full bg-white/5 rounded-md" />
            <div className="h-3 w-5/6 bg-white/5 rounded-md" />
            <div className="h-3 w-2/3 bg-white/5 rounded-md" />
          </div>
          <div className="pt-2 flex items-center gap-3">
            <div className="h-8 w-24 bg-white/10 rounded-lg" />
            <div className="h-8 w-24 bg-white/5 rounded-lg" />
          </div>
        </div>

        {/* Subtle Status Indicator */}
        <div className="flex items-center justify-center gap-2.5 pt-2 text-neutral-500">
          <span className="w-2 h-2 rounded-full bg-blue-500/80 animate-ping" />
          <span className="text-xs font-medium tracking-wide">{message}</span>
        </div>
      </div>
    </div>
  );
}

