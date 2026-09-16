export default function GlobalLoader({
  message = "Loading Scholar Core...",
}: {
  message?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="min-h-[50vh] w-full flex flex-col items-center justify-center p-8 bg-transparent text-[color:var(--text-secondary)] select-none pointer-events-none"
    >
      <div className="flex items-center gap-3">
        <span className="w-4 h-4 border-2 border-[color:var(--accent)] border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-medium tracking-wide">{message}</span>
      </div>
    </div>
  );
}

