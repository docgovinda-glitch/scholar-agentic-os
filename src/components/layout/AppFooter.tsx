import React from "react";

// Subcomponent: Application Footer (status / integrity protocol notice)
export default function AppFooter() {
  return (
    <footer className="chrome-dark border-t px-6 py-4 flex flex-col md:flex-row items-center justify-between text-xs text-[#94A3B8] gap-2 font-mono shrink-0">
      <span className="text-[10px] uppercase tracking-wider">
        System Core: <span className="text-[#E2E8F0] font-bold">Scholar Agentic OS v1.0</span> | State: <span className="text-[color:var(--color-luminous-blue)] font-bold">Active</span>
      </span>
      <span className="text-center md:text-right text-[10px] leading-relaxed max-w-xl">
        Academic Integrity Protocol // All AI-assisted research components are and must be explicitly attributed or annotated prior to publication submission.
      </span>
    </footer>
  );
}
