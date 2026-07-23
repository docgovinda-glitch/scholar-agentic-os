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
      <div className="border-b border-[#E5E7EB] pb-4">
        <h2 className="text-lg font-bold text-[#1A365D] font-serif">What are you producing?</h2>
        <p className="text-xs text-[#6B665E] font-sans mt-0.5">
          Pick an output format first — every research-input field on the next screen adapts to this choice.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {OUTPUT_FORMAT_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onSelect(option.id)}
            className="text-left p-5 bg-white border border-[#E5E7EB] hover:border-[#C08A3E] rounded-2xl shadow-sm hover:shadow-md transition-all cursor-pointer space-y-2"
          >
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#C08A3E] shrink-0" />
              <span className="text-sm font-bold text-[#1A365D] font-serif">{option.label}</span>
            </div>
            <p className="text-xs text-[#6B665E] font-sans leading-relaxed">{option.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
