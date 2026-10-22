import { Client } from "pg";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

async function run() {
  if (!dbUrl) {
    console.log(
      "No direct PostgreSQL DATABASE_URL found in environment. Database migration file is ready at supabase/migrations/20261009103516_normalize_project_state.sql."
    );
    return;
  }

  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    console.log("Connected to PostgreSQL database.");
    const sqlPath = path.resolve(
      process.cwd(),
      "supabase/migrations/20261009103516_normalize_project_state.sql"
    );
    const sql = fs.readFileSync(sqlPath, "utf8");
    await client.query(sql);
    console.log("Successfully applied 20261009103516_normalize_project_state.sql to database!");
  } catch (err: any) {
    console.error("Migration notice/error:", err.message);
  } finally {
    await client.end();
  }
}

run();
