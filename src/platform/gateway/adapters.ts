/**
 * Provider adapters — one per calling convention, not one per provider.
 *
 * Reuses the existing, already-isomorphic provider catalog
 * (src/config/providerCatalog.ts) for URLs, auth headers, and default
 * models rather than duplicating that table. New OpenAI-compatible
 * providers therefore need zero new adapter code — only a catalog entry.
 */

import {
  getCloudProvider,
  chatUrl,
  buildAuthHeaders,
  type CloudProviderSpec,
} from "../../config/providerCatalog";
import type { CompletionRequest, ProviderAdapter } from "./types";

class OpenAICompatibleAdapter implements ProviderAdapter {
  constructor(public id: string, private spec: CloudProviderSpec) {}

  async complete(req: CompletionRequest): Promise<{ text: string; model: string }> {
    const model = req.model || this.spec.defaultModel;
    const url = chatUrl(this.spec);
    const headers = { "Content-Type": "application/json", ...buildAuthHeaders(this.spec, req.apiKey) };
    const body = JSON.stringify({
      model,
      messages: [
        ...(req.systemPrompt ? [{ role: "system", content: req.systemPrompt }] : []),
        { role: "user", content: req.userPrompt },
      ],
      temperature: req.temperature ?? 0.3,
      ...(req.maxTokens ? { max_tokens: req.maxTokens } : {}),
    });

    const response = await fetch(url, { method: "POST", headers, body });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`${this.id} request failed (${response.status}): ${detail.slice(0, 300)}`);
    }
    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content ?? "";
    return { text, model };
  }
}

class AnthropicAdapter implements ProviderAdapter {
  constructor(public id: string, private spec: CloudProviderSpec) {}

  async complete(req: CompletionRequest): Promise<{ text: string; model: string }> {
    const model = req.model || this.spec.defaultModel;
    const url = chatUrl(this.spec);
    const headers = { "Content-Type": "application/json", ...buildAuthHeaders(this.spec, req.apiKey) };
    const body = JSON.stringify({
      model,
      max_tokens: req.maxTokens ?? 4096,
      system: req.systemPrompt,
      messages: [{ role: "user", content: req.userPrompt }],
      temperature: req.temperature ?? 0.3,
    });

    const response = await fetch(url, { method: "POST", headers, body });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`${this.id} request failed (${response.status}): ${detail.slice(0, 300)}`);
    }
    const data = (await response.json()) as { content?: { text?: string }[] };
    const text = data.content?.map((c) => c.text ?? "").join("") ?? "";
    return { text, model };
  }
}

/** Build the adapter for a given provider id, or undefined if unsupported. */
export function getAdapter(providerId: string): ProviderAdapter | undefined {
  const spec = getCloudProvider(providerId);
  if (!spec) return undefined;
  if (spec.apiStyle === "openai-compatible") return new OpenAICompatibleAdapter(providerId, spec);
  if (spec.apiStyle === "anthropic") return new AnthropicAdapter(providerId, spec);
  // gemini/cohere adapters are a documented gap — see docs 13-MODULE-SPECIFICATIONS.md §8.1;
  // the existing server/routes/ai.ts already implements these and is the migration source.
  return undefined;
}
