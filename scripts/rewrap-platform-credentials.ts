/**
 * Re-wraps all Content Encryption Keys (CEKs) in `public.platform_provider_credentials`
 * from `OLD_MASTER_KEY` to `NEW_MASTER_KEY` inside a single PostgreSQL transaction.
 *
 * Security invariants:
 * - Supports `--dry-run` (default if `--Execute` is not passed): unwraps and verifies
 *   every row in memory without writing to the database.
 * - Executes all `UPDATE` statements inside a single `BEGIN ... COMMIT` transaction on
 *   `DATABASE_URL` so partial re-wrapping is impossible.
 * - Prints counts and row IDs/provider IDs ONLY — never logs or prints any key or credential material.
 *
 * Usage:
 *   OLD_MASTER_KEY="<old-b64-or-hex>" NEW_MASTER_KEY="<new-b64>" DATABASE_URL="<pg-url>" \
 *     npx tsx scripts/rewrap-platform-credentials.ts --dry-run
 *
 *   OLD_MASTER_KEY="<old-b64-or-hex>" NEW_MASTER_KEY="<new-b64>" DATABASE_URL="<pg-url>" \
 *     npx tsx scripts/rewrap-platform-credentials.ts --execute
 */

import pg from "pg";
import { decrypt, unwrapKey, wrapKey } from "../src/services/crypto/crypto.ts";
import type { EncryptedPayload } from "../src/services/crypto/types.ts";

function parseMasterKey(envName: string): Buffer {
  const raw = process.env[envName]?.trim();
  if (!raw) {
    throw new Error(`Missing required environment variable: ${envName}`);
  }
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new Error(`${envName} must decode to exactly 32 bytes (got ${buf.length} bytes).`);
  }
  return buf;
}

interface PlatformCredDbRow {
  id: string;
  provider_id: string;
  label: string;
  encrypted_cek: EncryptedPayload;
  encrypted_credential: EncryptedPayload;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const isExecute = args.has("--execute");
  const isDryRun = !isExecute || args.has("--dry-run");

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error("Missing required environment variable: DATABASE_URL");
  }

  const oldKey = parseMasterKey("OLD_MASTER_KEY");
  const newKey = parseMasterKey("NEW_MASTER_KEY");

  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();

  try {
    await client.query("BEGIN");

    const { rows } = await client.query<PlatformCredDbRow>(
      `SELECT id, provider_id, label, encrypted_cek, encrypted_credential
       FROM public.platform_provider_credentials
       ORDER BY provider_id, label
       FOR UPDATE`
    );

    let verifiedCount = 0;
    let updatedCount = 0;

    for (const row of rows) {
      const cek = unwrapKey(row.encrypted_cek, oldKey);
      // Verify the unwrapped CEK actually decrypts the stored credential payload (discard result immediately)
      const decryptedBuf = decrypt(row.encrypted_credential, cek);
      decryptedBuf.fill(0);
      verifiedCount += 1;

      const rewrappedCek = wrapKey(cek, newKey);
      cek.fill(0);

      if (!isDryRun) {
        await client.query(
          `UPDATE public.platform_provider_credentials
           SET encrypted_cek = $1::jsonb, updated_at = now()
           WHERE id = $2`,
          [JSON.stringify(rewrappedCek), row.id]
        );
        updatedCount += 1;
      }
    }

    if (isDryRun) {
      await client.query("ROLLBACK");
      console.log(
        JSON.stringify({
          mode: "dry-run",
          totalRowsFound: rows.length,
          verifiedDecryptableRows: verifiedCount,
          updatedRows: 0,
        })
      );
    } else {
      await client.query("COMMIT");
      console.log(
        JSON.stringify({
          mode: "execute",
          totalRowsFound: rows.length,
          verifiedDecryptableRows: verifiedCount,
          updatedRows: updatedCount,
        })
      );
    }
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    oldKey.fill(0);
    newKey.fill(0);
    await client.end();
  }
}

main().catch((err) => {
  console.error("Rewrap script failed:", err instanceof Error ? err.message : "unknown error");
  process.exit(1);
});
