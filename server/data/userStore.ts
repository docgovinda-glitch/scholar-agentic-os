import { query, hasDatabaseUrl, withTransaction } from "./db";
import { readLegacyUsersJson, writeLegacyUsersJson } from "./legacyUsersJson";
import { getDataLayerConfig } from "./config";
import { runMigrations } from "./migrationRunner";
import type { DataLayerStatus, UserRecord } from "./types";

function normalizeUser(user: UserRecord): UserRecord {
  return {
    ...user,
    fullName: user.fullName || "",
    email: user.email || "",
    phone: user.phone || "",
    affiliation: user.affiliation || "",
    authenticId: user.authenticId || "",
    modelPreferences: user.modelPreferences || {},
    encryptedApiKeys: user.encryptedApiKeys || {},
    apiKeyHashes: user.apiKeyHashes || {},
    resetApproved: !!user.resetApproved,
    is_approved: !!user.is_approved,
    activationKeyHash: user.activationKeyHash || "",
  };
}

function uniqByUsername(users: UserRecord[]): UserRecord[] {
  const map = new Map<string, UserRecord>();
  for (const user of users) {
    if (!user.username) continue;
    map.set(user.username.trim(), normalizeUser(user));
  }
  return [...map.values()];
}

function mergeUsers(primary: UserRecord[], secondary: UserRecord[]): UserRecord[] {
  return uniqByUsername([...secondary, ...primary]);
}

class UserStore {
  private cache: UserRecord[] = [];
  private readyState = false;
  private migratedFromLegacy = false;
  private readonly databaseConfigured = hasDatabaseUrl();

  public readonly ready: Promise<void>;

  constructor() {
    this.ready = this.initialize();
  }

  private async initialize(): Promise<void> {
    if (!this.databaseConfigured) {
      this.cache = uniqByUsername(readLegacyUsersJson());
      this.readyState = true;
      this.migratedFromLegacy = false;
      return;
    }

    await runMigrations();

    const dbUsers = await this.loadFromDatabase();
    const legacyUsers = readLegacyUsersJson();
    const merged = mergeUsers(dbUsers, legacyUsers);

    if (merged.length > 0) {
      await this.persistToDatabase(merged);
    }

    if (legacyUsers.length > 0 && merged.length >= legacyUsers.length) {
      this.migratedFromLegacy = true;
    }

    this.cache = merged;
    this.readyState = true;
    if (getDataLayerConfig().mirrorLegacyWrites) {
      writeLegacyUsersJson(this.cache);
    }
  }

  private async loadFromDatabase(): Promise<UserRecord[]> {
    const rows = await query<any>(`
      SELECT
        username,
        full_name AS "fullName",
        email,
        phone,
        affiliation,
        authentic_id AS "authenticId",
        is_approved,
        activation_key_hash AS "activationKeyHash",
        passcode_hash AS "passcodeHash",
        temp_passcode_hash AS "tempPasscodeHash",
        reset_approved AS "resetApproved",
        model_preferences AS "modelPreferences",
        encrypted_api_keys AS "encryptedApiKeys",
        api_key_hashes AS "apiKeyHashes"
      FROM app_users
      ORDER BY username ASC
    `);

    return rows.rows.map((row) => normalizeUser(row as UserRecord));
  }

  private async persistToDatabase(users: UserRecord[]): Promise<void> {
    if (!this.databaseConfigured) return;
    await withTransaction(async (client) => {
      for (const user of users) {
        await client.query(
          `
          INSERT INTO app_users (
            username,
            full_name,
            email,
            phone,
            affiliation,
            authentic_id,
            is_approved,
            activation_key_hash,
            passcode_hash,
            temp_passcode_hash,
            reset_approved,
            model_preferences,
            encrypted_api_keys,
            api_key_hashes,
            profile_state,
            updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb, $14::jsonb, $15::jsonb, NOW()
          )
          ON CONFLICT (username) DO UPDATE SET
            full_name = EXCLUDED.full_name,
            email = EXCLUDED.email,
            phone = EXCLUDED.phone,
            affiliation = EXCLUDED.affiliation,
            authentic_id = EXCLUDED.authentic_id,
            is_approved = EXCLUDED.is_approved,
            activation_key_hash = EXCLUDED.activation_key_hash,
            passcode_hash = EXCLUDED.passcode_hash,
            temp_passcode_hash = EXCLUDED.temp_passcode_hash,
            reset_approved = EXCLUDED.reset_approved,
            model_preferences = EXCLUDED.model_preferences,
            encrypted_api_keys = EXCLUDED.encrypted_api_keys,
            api_key_hashes = EXCLUDED.api_key_hashes,
            profile_state = EXCLUDED.profile_state,
            updated_at = NOW()
          `,
          [
            user.username,
            user.fullName,
            user.email,
            user.phone,
            user.affiliation,
            user.authenticId,
            user.is_approved,
            user.activationKeyHash,
            user.passcodeHash || null,
            user.tempPasscodeHash || null,
            user.resetApproved || false,
            JSON.stringify(user.modelPreferences || {}),
            JSON.stringify(user.encryptedApiKeys || {}),
            JSON.stringify(user.apiKeyHashes || {}),
            JSON.stringify(user),
          ]
        );
      }
    });
  }

  public snapshot(): UserRecord[] {
    return [...this.cache];
  }

  public getStatus(): DataLayerStatus {
    return {
      ready: this.readyState,
      mode: this.databaseConfigured ? "postgres" : "legacy",
      userCount: this.cache.length,
      migratedFromLegacy: this.migratedFromLegacy,
      databaseUrlConfigured: this.databaseConfigured,
    };
  }

  public findByUsername(username: string): UserRecord | undefined {
    return this.cache.find((user) => user.username === username.trim());
  }

  public async saveAll(users: UserRecord[]): Promise<void> {
    const normalized = uniqByUsername(users);
    this.cache = normalized;

    if (this.databaseConfigured) {
      await this.persistToDatabase(normalized);
    }

    if (getDataLayerConfig().mirrorLegacyWrites) {
      writeLegacyUsersJson(normalized);
    }
  }

  public async upsert(user: UserRecord): Promise<void> {
    const normalized = normalizeUser(user);
    const existing = this.cache.filter((item) => item.username !== normalized.username);
    await this.saveAll([...existing, normalized]);
  }

  public async migrateLegacyUsersIfNeeded(): Promise<void> {
    if (!this.databaseConfigured) return;
    const legacyUsers = readLegacyUsersJson();
    if (legacyUsers.length === 0) return;

    const existingUsers = this.snapshot();
    const merged = mergeUsers(existingUsers, legacyUsers);
    if (merged.length !== existingUsers.length) {
      await this.saveAll(merged);
      this.migratedFromLegacy = true;
    }
  }
}

export const userStore = new UserStore();

export async function initializeUserStore(): Promise<void> {
  await userStore.ready;
}

export function getUserStoreStatus(): DataLayerStatus {
  return userStore.getStatus();
}

export function readUsersDb(): UserRecord[] {
  return userStore.snapshot();
}

export async function writeUsersDb(users: UserRecord[]): Promise<void> {
  await userStore.saveAll(users);
}

export function findUserByUsername(username: string): UserRecord | undefined {
  return userStore.findByUsername(username);
}

export async function upsertUser(user: UserRecord): Promise<void> {
  await userStore.upsert(user);
}
