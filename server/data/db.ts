import { Pool, type PoolClient } from "pg";
import { getDataLayerConfig } from "./config";

let pool: Pool | null = null;

export function hasDatabaseUrl(): boolean {
  return Boolean(getDataLayerConfig().databaseUrl);
}

export function getPool(): Pool | null {
  if (!hasDatabaseUrl()) return null;
  if (!pool) {
    const { databaseUrl, databaseSsl } = getDataLayerConfig();
    pool = new Pool({
      connectionString: databaseUrl,
      ssl: databaseSsl ? { rejectUnauthorized: false } : undefined,
      max: 5,
    });
  }
  return pool;
}

export async function query<T = any>(text: string, params: unknown[] = []): Promise<{ rows: T[] }> {
  const currentPool = getPool();
  if (!currentPool) {
    throw new Error("PostgreSQL is not configured");
  }
  return currentPool.query<T>(text, params);
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const currentPool = getPool();
  if (!currentPool) {
    throw new Error("PostgreSQL is not configured");
  }

  const client = await currentPool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

