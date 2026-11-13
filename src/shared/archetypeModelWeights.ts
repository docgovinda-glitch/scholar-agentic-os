/**
 * Server-side loader for the trained archetype/style model weights (about 2 MB).
 * Imported ONLY by scholarBrain (server bundle). Do not import it from client
 * code: Vite would bundle the 2 MB JSON and break the 500 kB chunk budget
 * (scripts/verify-chunk-budget.mjs).
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
