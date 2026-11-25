/**
 * Task-aware chain order. Free cloud tiers differ a lot in what they are good
 * for: a few have a very large daily allowance of fast, small-to-mid models
 * (the "workhorses": Cerebras, Groq, Zhipu, Cloudflare, OVHcloud), while the
 * providers with the strongest reasoning models meter them tightly. Quick work
 * (chat, extraction, classification, summarising: the `fast` task class) is
 * therefore tried on the workhorses first, so the scarce reasoning quota is
 * left for work that needs it. Every other task keeps the person's own order.
 *
 * Whatever the task, a model that runs in the browser stays last: the server
 * hands the request to the browser at the first such candidate and the browser
 * continues with local runners only, so a cloud candidate placed after one
 * would never be tried.
 *
 * `strict` (AI Access → "Use my order exactly") turns the reordering off.
 *
 * Pure: shared by the server routes and tests.
 */
import { isFreeWorkhorse } from "../../config/providerCatalog";
import type { TaskClass } from "./types";

/** What ordering needs to know about a connection: works on router candidates and on keyring previews alike. */
export interface Orderable {
  lane: "byok" | "local";
  provider: string;
  /** The catalog connection ("openrouter", "cerebras#2"); falls back to `provider`. */
  group?: string;
  runsIn?: "server" | "browser";
  /** The model id, when known; lets heavy tasks skip tiny or code-only local models. */
  model?: string;
}

/**
 * A local model too small (<7B parameters) or built only for code to carry long-form
 * prose: deep-research synthesis, outlines, essay or manuscript drafting. Judged from
 * the id alone ("qwen2.5-coder:1.5b", "llama3.2:3b"); unknown sizes are not penalised.
 */
export function isUndersizedForProse(model?: string): boolean {
  if (!model) return false;
  const id = model.toLowerCase();
  if (/(^|[-_/:.])(coder|code|codestral|starcoder)([-_/:.]|$)/.test(id)) return true;
  const m = id.match(/(?:^|[-_:/.])(\d+(?:\.\d+)?)\s*b(?:$|[-_:/.])/);
  return m ? parseFloat(m[1]) < 7 : false;
}

/** Tasks that need long, coherent prose; "coding" and "fast" are excluded on purpose. */
const HEAVY_PROSE: ReadonlySet<TaskClass> = new Set<TaskClass>(["reasoning", "drafting", "long-context"]);

/** Request header carrying the person's routing choice: "manual" keeps their order for every task. */
export const ROUTING_HEADER = "x-ai-routing";
export const ROUTING_MANUAL = "manual";

export const strictOrderFromHeader = (value: unknown): boolean => value === ROUTING_MANUAL;

/** "openrouter#2" → "openrouter". */
const connectionProvider = (c: Orderable): string => (c.group ?? c.provider).replace(/#\d+$/, "");

export function orderChain<T extends Orderable>(candidates: T[], task: TaskClass, opts: { strict?: boolean } = {}): T[] {
  const cloud = candidates.filter((c) => c.lane === "byok");
  const local = candidates.filter((c) => c.lane === "local");
  const serverLocal = local.filter((c) => c.runsIn === "server");
  const browserLocal = local.filter((c) => c.runsIn !== "server");
  if (opts.strict) return [...cloud, ...serverLocal, ...browserLocal];
  if (HEAVY_PROSE.has(task)) {
    // Tiny / code-only local models stay available but only after the capable ones.
    const capableFirst = <U extends Orderable>(xs: U[]): U[] => [
      ...xs.filter((c) => !isUndersizedForProse(c.model)),
      ...xs.filter((c) => isUndersizedForProse(c.model)),
    ];
    return [...cloud, ...capableFirst(serverLocal), ...capableFirst(browserLocal)];
  }
  if (task !== "fast") return [...cloud, ...serverLocal, ...browserLocal];
  const workhorses = cloud.filter((c) => isFreeWorkhorse(connectionProvider(c)));
  const others = cloud.filter((c) => !isFreeWorkhorse(connectionProvider(c)));
  // A remote runner (tunnelled GPU) is free capacity too: it goes with the workhorses.
  return [...workhorses, ...serverLocal, ...others, ...browserLocal];
}
