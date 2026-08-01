import React from "react";
import { getAllDocumentTypes } from "../types/documentTypes";
import type { DocumentType } from "../types/documentTypes";
import { GlassmorphicCard } from "./SciFiComponents";

interface DocumentTypeSelectorProps {
  value?: DocumentType;
  onChange: (type: DocumentType) => void;
  displayMode?: "grid" | "dropdown";
}

export function DocumentTypeSelector({
  value,
  onChange,
  displayMode = "grid"
}: DocumentTypeSelectorProps) {
  const documentTypes = getAllDocumentTypes();

  if (displayMode === "dropdown") {
    return (
      <div className="w-full">
        <label className="block text-sm font-mono text-slate-300 mb-2">
          Document Type
        </label>
        <select
          value={value || ""}
          onChange={(e) => onChange(e.target.value as DocumentType)}
          className="w-full px-4 py-2 rounded-lg bg-navy-1 border border-luminous-blue/30 text-slate-100 font-mono text-sm focus:outline-none focus:border-luminous-blue focus:ring-1 focus:ring-luminous-blue/50"
        >
          <option value="">Select a document type...</option>
          {documentTypes.map((type) => (
            <option key={type.id} value={type.id}>
              {type.label}
            </option>
          ))}
        </select>
        {value && (
          <p className="mt-2 text-xs text-slate-400">
            {documentTypes.find((t) => t.id === value)?.description}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="w-full">
      <h3 className="text-sm font-mono font-semibold text-luminous-blue mb-4">
        Choose Your Document Type
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {documentTypes.map((type) => (
          <GlassmorphicCard
            key={type.id}
            onClick={() => onChange(type.id)}
            className={`p-4 cursor-pointer transition-all ${
              value === type.id
                ? "border-luminous-blue ring-1 ring-luminous-blue/50 bg-luminous-blue/5"
                : "hover:border-luminous-blue/50"
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <h4 className="font-mono font-semibold text-slate-100 text-sm">
                  {type.label}
                </h4>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  {type.description}
                </p>
                <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                  <span>📄 {type.wordCountTarget.min}-{type.wordCountTarget.max}k words</span>
                </div>
              </div>
              {value === type.id && (
                <div className="w-3 h-3 rounded-full bg-luminous-blue flex-shrink-0 mt-1" />
              )}
            </div>
          </GlassmorphicCard>
        ))}
      </div>
    </div>
  );
}
