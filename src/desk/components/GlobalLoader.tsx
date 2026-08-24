export default function GlobalLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[color:var(--surface-canvas)] flex-col gap-4">
      {/* Dynamic Background Effects matching the brand */}
      <div className="absolute top-[-20%] right-[-10%] w-[50%] h-[50%] bg-[color:var(--accent-subtle)] blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-20%] left-[-10%] w-[40%] h-[60%] bg-[color:var(--state-info-subtle)] blur-[150px] rounded-full pointer-events-none" />
      
      <div className="relative z-10 flex flex-col items-center gap-6">
        <div className="relative flex items-center justify-center w-16 h-16 rounded-2xl bg-[color:var(--accent)] shadow-lg shadow-[color:var(--accent-subtle)] animate-pulse">
          <span className="text-[color:var(--text-inverse)] font-bold text-3xl font-serif">S</span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[color:var(--accent)] animate-bounce" style={{ animationDelay: "0ms" }} />
            <div className="w-2 h-2 rounded-full bg-[color:var(--accent)] animate-bounce" style={{ animationDelay: "150ms" }} />
            <div className="w-2 h-2 rounded-full bg-[color:var(--accent)] animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
          <span className="text-sm font-medium text-[color:var(--text-secondary)] tracking-wide">
            Loading Scholar Core...
          </span>
        </div>
      </div>
    </div>
  );
}
