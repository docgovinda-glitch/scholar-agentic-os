import fs from "fs";
import { getDataLayerConfig } from "./config";
import type { UserRecord } from "./types";

function normalizeUser(user: Partial<UserRecord>): UserRecord {
  return {
    username: user.username || "",
    fullName: user.fullName || "",
    email: user.email || "",
    phone: user.phone || "",
    affiliation: user.affiliation || "",
    authenticId: user.authenticId || "",
    is_approved: !!user.is_approved,
    activationKeyHash: user.activationKeyHash || "",
    passcodeHash: user.passcodeHash,
    tempPasscodeHash: user.tempPasscodeHash,
    resetApproved: user.resetApproved,
    modelPreferences: user.modelPreferences || {},
    encryptedApiKeys: user.encryptedApiKeys || {},
    apiKeyHashes: user.apiKeyHashes || {},
  };
}

export function readLegacyUsersJson(): UserRecord[] {
  const { legacyUsersPath } = getDataLayerConfig();
  try {
    if (!fs.existsSync(legacyUsersPath)) {
      return [];
    }
    const raw = fs.readFileSync(legacyUsersPath, "utf-8");
    const parsed = JSON.parse(raw);
    const users = Array.isArray(parsed?.users) ? parsed.users : [];
    return users.map((user: Partial<UserRecord>) => normalizeUser(user)).filter((user) => user.username);
  } catch (error) {
    console.error("[DataLayer] Failed to read legacy users.json:", error);
    return [];
  }
}

export function writeLegacyUsersJson(users: UserRecord[]): void {
  const { legacyUsersPath } = getDataLayerConfig();
  try {
    fs.writeFileSync(legacyUsersPath, JSON.stringify({ users }, null, 2));
  } catch (error) {
    console.error("[DataLayer] Failed to mirror users.json:", error);
  }
}

