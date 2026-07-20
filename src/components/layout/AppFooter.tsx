import React from "react";

// Subcomponent: Application Footer (status / integrity protocol notice)
export default function AppFooter() {
  return (
    <footer className="border-t border-[#E5E7EB] bg-[#FFFFFF] px-6 py-4 flex flex-col md:flex-row items-center justify-between text-xs text-[#8C887F] gap-2 font-mono shrink-0">
      <span className="text-[10px] uppercase tracking-wider">
        System Core: <span className="text-[#1A365D] font-bold">Scholar Agentic OS v1.0</span> | State: <span className="text-emerald-600 font-bold">Active</span>
      </span>
      <span className="text-center md:text-right text-[10px] leading-relaxed max-w-xl">
        Academic Integrity Protocol // All AI-assisted research components are and must be explicitly attributed or annotated prior to publication submission.
      </span>
    </footer>
  );
}
