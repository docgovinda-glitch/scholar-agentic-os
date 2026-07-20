import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import type { UserRecord } from "./types.js";
export type { UserRecord } from "./types.js";

const USERS_DB_PATH = join(__dirname, "..", "..", "users.json");

export function readUsersDb(): UserRecord[] {
  try {
    if (!existsSync(USERS_DB_PATH)) {
      writeFileSync(USERS_DB_PATH, JSON.stringify({ users: [] }, null, 2));
      return [];
    }
    const raw = readFileSync(USERS_DB_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return parsed.users || [];
  } catch (err) {
    console.error("Failed to read users database:", err);
    return [];
  }
}

export function writeUsersDb(users: UserRecord[]) {
  try {
    writeFileSync(USERS_DB_PATH, JSON.stringify({ users }, null, 2));
  } catch (err) {
    console.error("Failed to write users database:", err);
  }
}