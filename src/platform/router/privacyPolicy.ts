/**
 * Privacy rules that decide which connections a request may use at all.
 *
 * - "Local AI only" (`privacyPreference: "no-cloud"`): no cloud connection is ever offered.
 * - Confidential mode (`confidentialMode: "true"`): for unpublished thesis and manuscript text. A cloud
 *   connection is offered only when its provider documents that prompts are not used for training by
 *   default (`dataPolicy.trainsOnFreeTier === "no-training"`), or the person has said this key is on a paid /
 *   zero-retention plan (`<provider>PrivateTier: "true"`). Free tiers that train (Google AI Studio, Mistral
 *   Free, OpenAI's complimentary tokens) and providers whose policy is not confirmed are left out. Local runners,
 *   including a person's own tunnelled GPU, always qualify: the text goes only where the person put the runner.
 *
 * Applied where the keyring is built (`assembleKeyring`), which both the browser and the server use, so it holds
 * on every device and for the account-vault path alike.
 *
 * Pure.
 */
import { getCloudProvider } from "../../config/providerCatalog";

export type Prefs = Record<string, string> | undefined;

export const PRIVACY_PREF = "privacyPreference";
export const CONFIDENTIAL_PREF = "confidentialMode";
/** "manual": every task uses the connections in the person's own order. Default: quick tasks try the free workhorses first. */
export const ROUTING_PREF = "taskRouting";

export const privateTierPref = (providerId: string): string => `${providerId}PrivateTier`;

export const noCloudOnly = (prefs: Prefs): boolean => prefs?.[PRIVACY_PREF] === "no-cloud";
export const confidentialMode = (prefs: Prefs): boolean => prefs?.[CONFIDENTIAL_PREF] === "true";
export const manualRouting = (prefs: Prefs): boolean => prefs?.[ROUTING_PREF] === "manual";

export type ConfidentialVerdict = { allowed: true } | { allowed: false; reason: string };

/** Whether Confidential mode lets this cloud provider see the person's text. */
export function confidentialModeAllows(providerId: string, prefs: Prefs): ConfidentialVerdict {
  if (prefs?.[privateTierPref(providerId)] === "true") return { allowed: true };
  const policy = getCloudProvider(providerId)?.dataPolicy;
  if (policy?.trainsOnFreeTier === "no-training") return { allowed: true };
  if (!policy || policy.trainsOnFreeTier === "unknown") {
    return { allowed: false, reason: "Its data policy is not confirmed. Mark the key as paid / zero-retention if you know it is." };
  }
  return { allowed: false, reason: policy.note };
}

/** Whether a cloud connection to this provider may be offered under the person's privacy settings. */
export function cloudAllowed(providerId: string, prefs: Prefs): boolean {
  if (noCloudOnly(prefs)) return false;
  return !confidentialMode(prefs) || confidentialModeAllows(providerId, prefs).allowed;
}
