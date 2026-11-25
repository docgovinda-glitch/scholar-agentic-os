/** Whether a configured model suits long-form Deep Research synthesis. Judged from its name only. */

export interface ModelRef {
  model: string;
  provider?: string;
  via?: string;
}

const LOCAL = new Set(["ollama", "lmstudio"]);

export function modelBillions(model: string): number | undefined {
  const m = model.toLowerCase().match(/(?<![\d.])(\d+(?:\.\d+)?)\s*b(?![a-z])/);
  return m ? Number(m[1]) : undefined;
}

export function isCodeModel(model: string): boolean {
  return /coder|codellama|starcoder|codestral|deepseek-coder|-code\b/i.test(model);
}

export function isWeakForSynthesis(entry: ModelRef): string | undefined {
  const size = modelBillions(entry.model);
  if (isCodeModel(entry.model)) return `${entry.model} is tuned for code, not long-form research writing`;
  if (size !== undefined && size < 7 && (LOCAL.has(entry.provider || "") || LOCAL.has(entry.via || ""))) {
    return `${entry.model} is a small local model (${size}B) and may time out on a long report`;
  }
  return undefined;
}

/** A warning when the model that will lead the chain is weak and another configured model is not. */
export function assessDeepResearchModel(ring: ModelRef[]): { warn: boolean; message?: string; hasBetter: boolean } {
  const first = ring[0];
  if (!first) return { warn: false, hasBetter: false };
  const reason = isWeakForSynthesis(first);
  if (!reason) return { warn: false, hasBetter: false };
  const hasBetter = ring.slice(1).some((e) => !isWeakForSynthesis(e));
  return {
    warn: true,
    hasBetter,
    message: `${reason}. ${hasBetter ? "Another configured model is better suited: move it first in AI Access." : "Connect a larger cloud model in AI Access for Deep Research."}`,
  };
}
