/**
 * A provider can hold more than one key. The first is stored under the
 * provider's own id ("openai"); backups use "openai#2", "openai#3". Every
 * store (this device, the account vault, the keyring) uses these ids, so a
 * backup key travels between devices exactly like the main one.
 */
export const MAX_KEYS_PER_PROVIDER = 3;

export interface KeySlot { providerId: string; slot: number }

/** "openai#2" -> { providerId: "openai", slot: 2 }; "openai" -> slot 1. */
export function parseKeyId(keyId: string): KeySlot {
  const m = /^(.+)#([2-9])$/.exec(keyId);
  return m ? { providerId: m[1], slot: Number(m[2]) } : { providerId: keyId, slot: 1 };
}

export const keyIdFor = (providerId: string, slot: number): string => (slot <= 1 ? providerId : `${providerId}#${slot}`);

/** The stored ids for a provider's keys, in order: main first. */
export const keyIdsFor = (providerId: string): string[] => Array.from({ length: MAX_KEYS_PER_PROVIDER }, (_, i) => keyIdFor(providerId, i + 1));
