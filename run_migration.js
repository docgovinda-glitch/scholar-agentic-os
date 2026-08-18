import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await pool.query(`alter table public.projects add column if not exists authors jsonb not null default '[]'::jsonb;`);
  console.log("Migration complete");
  process.exit(0);
}
run().catch(console.error);
