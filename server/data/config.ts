import path from "path";

export interface DataLayerConfig {
  databaseUrl: string;
  databaseSsl: boolean;
  legacyUsersPath: string;
  migrationsPath: string;
  mirrorLegacyWrites: boolean;
}

export function getDataLayerConfig(): DataLayerConfig {
  return {
    databaseUrl: process.env.DATABASE_URL || process.env.POSTGRES_URL || "",
    databaseSsl: (process.env.DATABASE_SSL || "").toLowerCase() === "require",
    legacyUsersPath: path.join(process.cwd(), "users.json"),
    migrationsPath: path.join(process.cwd(), "server", "data", "migrations"),
    mirrorLegacyWrites: (process.env.MIRROR_LEGACY_USERS_JSON || "true").toLowerCase() !== "false",
  };
}

