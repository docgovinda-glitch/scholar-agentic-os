import React from "react";
import WritingStyleSelector from "./WritingStyleSelector";
import type { WritingStyleConfig, WritingToneConfig } from "../types";

export interface WritingToneSelectorProps {
  value: WritingToneConfig;
  onChange: (tone: WritingToneConfig) => void;
}

export default function WritingToneSelector({
  value,
  onChange,
}: WritingToneSelectorProps) {
  return (
    <WritingStyleSelector
      value={value as WritingStyleConfig}
      onChange={(style) => onChange(style as WritingToneConfig)}
    />
  );
}
