/**
 * The one place AI Access reads and mutates a user's provider connections.
 *
 * Before this existed, connection state lived entirely inside
 * AiSetupScreen's local `useState` and was shaped around setting up exactly
 * ONE provider: pick a provider, enter a key, continue. That is why the
 * AI Access page could only ever show four "Not configured" cards and hand
 * off to a single generic setup form — there was no model of "the set of
 * providers I have connected", only "the provider I last chose".
 *
 * Nothing underneath needed replacing to fix that, which is why this is a new
 * read/write layer over existing pieces rather than a parallel system:
 *
 *   - `user_ai_connections` is already keyed (user_id, provider_id), so the
 *     server has always been able to hold many connections per user.
 *   - `storeProviderKey`/`readProviderKey` are already per-provider and
 *     device-local, so many keys can coexist.
 *   - `preferences` is already a free-form map, so `${id}Model`,
 *     `${id}Endpoint` and `${id}BaseUrl` can be held per provider.
 *
 * What was missing was a view that composes the three into one connection
 * list. That is all this file is.
 *
 * SECURITY: API keys live in `storeProviderKey`'s encrypted device store and,
 * encrypted under the server's MASTER_KEY, in the user's account
 * (accountKeys.ts / userKeyVault.ts) so they work on every device. They are
 * never placed in React state beyond the moment of entry and never written to
 * `preferences`. Premium is the deliberate opposite — the platform's own keys
 * stay server-side and are never sent to the browser at all.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { CLOUD_PROVIDERS, getCloudProvider, providerAccessFacts, type CloudProviderSpec } from "../../config/providerCatalog";
import { LOCAL_RUNNERS, getLocalRunner, type LocalRunnerSpec } from "../../config/localRunnerCatalog";
import {
  DEFAULT_AI_SETTINGS,
  forgetProviderKey,
  loadUserAiSettings,
  providersWithStoredKey,
  saveUserAiSettings,
  storeProviderKey,
  type UserAiSettings,
} from "../../services/userAiSettings";
import { removeKeyFromAccount, saveKeyToAccount, syncKeysWithAccount } from "./accountKeys";
import { addConnection, getAiAccessStatus, removeConnection, verifyProviderKey, type AiAccessStatus, type VerifyKeyResult } from "./aiAccessApi";

export type ConnectionTier = "local" | "free" | "byok";

/** A provider as AI Access shows it: catalogue facts joined to this user's live state. */
export interface ProviderView {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  kind: "cloud" | "local";
  /** Present for cloud providers only. */
  spec?: CloudProviderSpec;
  /** Present for local runners only. */
  runner?: LocalRunnerSpec;
  connected: boolean;
  /** Tier recorded on the server for this connection, when connected. */
  tier: ConnectionTier | null;
  /** True when a key for this provider exists in this device's encrypted store. */
  hasKeyOnDevice: boolean;
  /** Model currently selected for this provider, if any. */
  selectedModel: string | null;
  /** How many models the last verification/probe found. */
  modelsDetected: number | null;
  /** True when this is the user's default provider. */
  isDefault: boolean;
}

export interface AiAccessState {
  loading: boolean;
  error: string | null;
  status: AiAccessStatus | null;
  settings: UserAiSettings;
  cloud: ProviderView[];
  local: ProviderView[];
  /** Everything currently connected, across tiers. */
  connected: ProviderView[];
  premiumActive: boolean;
}

export interface ConnectCloudInput {
  providerId: string;
  apiKey: string;
  tier: ConnectionTier;
  model?: string;
  baseUrl?: string;
  /** Set true to make this the default provider once connected. */
  makeDefault?: boolean;
}

export function useAiAccess() {
  const [status, setStatus] = useState<AiAccessStatus | null>(null);
  const [settings, setSettings] = useState<UserAiSettings>(DEFAULT_AI_SETTINGS);
  const [keyed, setKeyed] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [s, cfg] = await Promise.all([getAiAccessStatus(), loadUserAiSettings()]);
      setStatus(s);
      setSettings(cfg);
    } catch (e) {
      // A failed status read must not blank the page: the catalogue and any
      // device-local keys are still perfectly usable offline, so the UI keeps
      // rendering and simply reports that live state is unavailable.
      setError((e as Error).message);
    } finally {
      setKeyed(providersWithStoredKey());
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    // Pick up keys saved to the account from another device.
    void syncKeysWithAccount().then((r) => {
      if (r && (r.pulled.length || r.removed.length || r.pushed.length)) setKeyed(providersWithStoredKey());
    });
    const onChange = () => setKeyed(providersWithStoredKey());
    window.addEventListener("scholar:ai-config-changed", onChange);
    return () => window.removeEventListener("scholar:ai-config-changed", onChange);
  }, [refresh]);

  const build = useCallback(
    (): { cloud: ProviderView[]; local: ProviderView[] } => {
      const conns = status?.connections ?? [];
      const byId = new Map(conns.map((c) => [c.provider_id, c]));

      const cloud = CLOUD_PROVIDERS.map<ProviderView>((spec) => {
        const conn = byId.get(spec.id);
        return {
          id: spec.id,
          name: spec.name,
          description: spec.description,
          icon: spec.icon,
          color: spec.color,
          kind: "cloud",
          spec,
          connected: Boolean(conn),
          tier: (conn?.tier as ConnectionTier | undefined) ?? null,
          hasKeyOnDevice: keyed.includes(spec.id),
          selectedModel: settings.preferences[`${spec.id}Model`] ?? null,
          modelsDetected: conn?.models_detected ?? null,
          isDefault: settings.provider === spec.id,
        };
      });

      const local = LOCAL_RUNNERS.map<ProviderView>((runner) => {
        const conn = byId.get(runner.id);
        return {
          id: runner.id,
          name: runner.name,
          description: runner.description,
          icon: runner.icon,
          color: "#64748B",
          kind: "local",
          runner,
          connected: Boolean(conn),
          tier: (conn?.tier as ConnectionTier | undefined) ?? null,
          // Local runners authenticate with nothing, so "has a key" is never
          // the question for them — it is whether the endpoint answers.
          hasKeyOnDevice: false,
          selectedModel: settings.preferences[`${runner.id}Model`] ?? null,
          modelsDetected: conn?.models_detected ?? null,
          isDefault: settings.provider === runner.id,
        };
      });

      return { cloud, local };
    },
    [status, settings, keyed]
  );

  const { cloud, local } = useMemo(build, [build]);
  const connected = useMemo(() => [...local, ...cloud].filter((p) => p.connected), [cloud, local]);
  const premiumActive = status?.entitlement.active ?? false;

  /** Verify a key with the provider, store it on this device, and record the connection. */
  const connectCloud = useCallback(
    async (input: ConnectCloudInput): Promise<{ ok: boolean; error?: string; modelsDetected?: number }> => {
      const spec = getCloudProvider(input.providerId);
      if (!spec) return { ok: false, error: `Unknown provider "${input.providerId}".` };

      // The key goes to our server once, transiently, so the provider check
      // happens server-side (no CORS surprises, and no key in a URL). It is
      // never persisted there — see server/routes/aiAccess.ts.
      const verification: VerifyKeyResult = await (
        input.baseUrl
          ? verifyProviderKey(input.providerId, input.apiKey, input.baseUrl)
          : verifyProviderKey(input.providerId, input.apiKey)
      ).catch((e) => ({
        ok: false,
        error: (e as Error).message,
      }));
      if (!verification.ok) {
        return { ok: false, error: verification.error ?? "Could not verify this key with the provider." };
      }

      await storeProviderKey(input.providerId, input.apiKey);
      // Saved to the account too, so it works on the person's other devices.
      // If that fails now, the next sync uploads it.
      await saveKeyToAccount(input.providerId, input.apiKey);
      await addConnection(input.providerId, input.tier, verification.modelsDetected);

      const next: UserAiSettings = {
        provider: input.makeDefault ? input.providerId : settings.provider,
        preferences: {
          ...settings.preferences,
          [`${input.providerId}Model`]: input.model || settings.preferences[`${input.providerId}Model`] || spec.defaultModel,
          ...(input.baseUrl ? { [`${input.providerId}BaseUrl`]: input.baseUrl } : {}),
        },
      };
      await saveUserAiSettings(next);
      setSettings(next);
      setKeyed(providersWithStoredKey());
      await refresh();
      return { ok: true, modelsDetected: verification.modelsDetected };
    },
    [settings, refresh]
  );

  /** Record a reachable local runner as a connection. No key, no verification call. */
  const connectLocal = useCallback(
    async (runnerId: string, endpoint: string, model: string, modelsDetected: number, makeDefault?: boolean) => {
      const runner = getLocalRunner(runnerId);
      if (!runner) return { ok: false, error: `Unknown local runner "${runnerId}".` };

      await addConnection(runnerId, "local", modelsDetected);
      const next: UserAiSettings = {
        provider: makeDefault ? runnerId : settings.provider,
        preferences: {
          ...settings.preferences,
          [`${runnerId}Endpoint`]: endpoint,
          ...(model ? { [`${runnerId}Model`]: model } : {}),
        },
      };
      await saveUserAiSettings(next);
      setSettings(next);
      await refresh();
      return { ok: true };
    },
    [settings, refresh]
  );

  /** Remove the server connection AND any device-local key for this provider. */
  const disconnect = useCallback(
    async (providerId: string) => {
      await removeConnection(providerId);
      await removeKeyFromAccount(providerId);
      forgetProviderKey(providerId);
      setKeyed(providersWithStoredKey());
      await refresh();
    },
    [refresh]
  );

  const setDefaultProvider = useCallback(
    async (providerId: string) => {
      const next = { ...settings, provider: providerId };
      await saveUserAiSettings(next);
      setSettings(next);
    },
    [settings]
  );

  const setModelFor = useCallback(
    async (providerId: string, model: string) => {
      const next = { ...settings, preferences: { ...settings.preferences, [`${providerId}Model`]: model } };
      await saveUserAiSettings(next);
      setSettings(next);
    },
    [settings]
  );

  const setPreference = useCallback(
    async (key: string, value: string) => {
      const next = { ...settings, preferences: { ...settings.preferences, [key]: value } };
      await saveUserAiSettings(next);
      setSettings(next);
    },
    [settings]
  );

  return {
    loading,
    error,
    status,
    settings,
    cloud,
    local,
    connected,
    premiumActive,
    refresh,
    connectCloud,
    connectLocal,
    disconnect,
    setDefaultProvider,
    setModelFor,
    setPreference,
  };
}

/**
 * Which catalogue entries belong in each section.
 *
 * "Free" lists everything a user can start using without paying — both
 * ongoing free tiers and signup trial credits — and EXCLUDES only providers
 * with no free access at all. Trial credits are included because a finite pot
 * of credits genuinely does let someone start for nothing, but they are never
 * presented as the same thing as a free tier: every row and every detail pane
 * carries the provider's own costLabel ("Free tier" vs "Trial credits" vs
 * "Paid"), so the distinction is stated rather than blurred. Dropping them
 * from the list entirely would hide real free-to-start options; labelling
 * them "Free" would be the dishonesty the catalogue's FreeTierKind exists to
 * prevent.
 *
 * "Pro / BYOK" lists EVERY cloud provider, including the free-tier ones. That
 * is not a duplicate: bring-your-own-key is about supplying a key you already
 * hold, and a user may well hold a paid Gemini or Mistral key. Restricting
 * BYOK to paid-only providers would make those keys unusable for no reason.
 */
export function freeProviders(): CloudProviderSpec[] {
  return CLOUD_PROVIDERS.filter((p) => p.freeTier !== "paid");
}

export function byokProviders(): CloudProviderSpec[] {
  return CLOUD_PROVIDERS;
}
