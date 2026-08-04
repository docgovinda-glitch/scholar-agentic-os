/**
 * Database client for server-side API routes
 * Uses Supabase PostgreSQL connection via pg library
 */

import pkg from "pg";
const { Pool } = pkg;

const DATABASE_URL = process.env.DATABASE_URL;

export const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

pool.on("error", (err) => {
  console.error("Unexpected error on idle client", err);
});

export async function query(text: string, params?: any[]) {
  return pool.query(text, params);
}
