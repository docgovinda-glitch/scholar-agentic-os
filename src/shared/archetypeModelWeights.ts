/**
 * Single loader for the trained archetype/style model weights.
 * scholarBrain (server/src/services/scholarBrain.ts) owns this data; the
 * browser-side styleEngineService reads it only through this module so there is
 * exactly one source of quantitative style rules. Pure data: no browser APIs.
 */
import weights from "../features/coursework/data/archetype_model_weights.json";

export interface ArchetypeModelWeights {
  classes: string[];
  vocabulary?: Record<string, number>;
  class_weights?: Record<string, unknown>;
  tone_mapping?: Record<string, { primary: string; secondary: string }>;
  [key: string]: unknown;
}

export function loadArchetypeModelWeights(): ArchetypeModelWeights {
  return weights as unknown as ArchetypeModelWeights;
}
