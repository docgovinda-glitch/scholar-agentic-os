import React from "react";
import { FileText } from "lucide-react";
import { OutputFormat } from "../types";
import { OUTPUT_FORMAT_OPTIONS } from "../config/outputFormats";

interface OutputFormatSelectorProps {
  onSelect: (format: OutputFormat) => void;
}

export default function OutputFormatSelector({ onSelect }: OutputFormatSelectorProps) {
  return (
    <div className="space-y-6">
      <div className="border-b border-[color:var(--color-navy-4)] pb-4">
        <h2 className="text-lg font-bold text-[#E2E8F0]">What are you producing?</h2>
        <p className="text-xs text-[#94A3B8] font-sans mt-0.5">
          Pick an output format first — every research-input field on the next screen adapts to this choice.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {OUTPUT_FORMAT_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onSelect(option.id)}
            className="text-left p-5 bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] hover:border-[color:var(--color-luminous-blue)] rounded-2xl shadow-sm hover:shadow-md transition-all cursor-pointer space-y-2"
          >
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-[color:var(--color-luminous-blue)] shrink-0" />
              <span className="text-sm font-bold text-[#E2E8F0]">{option.label}</span>
            </div>
            <p className="text-xs text-[#94A3B8] font-sans leading-relaxed">{option.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
