#!/usr/bin/env bash
# Compares production's schema with a fresh replay of the repo's migrations.
#
#   scripts/db/schema-diff.sh "postgresql://postgres@127.0.0.1:55432/replay_db"
#
# 1. Replays supabase-stub.sql + every migration into the given empty local
#    database (scripts/db/replay-migrations.sh).
# 2. Runs schema-fingerprint.sql (SELECT only) there and on production through
#    the Supabase Management API, inside a read-only transaction.
# 3. Prints the diff: "<" only in the replay, ">" only in production.
#
# Needs SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF (read from
# ~/.scholar-agent.env when present; never printed). Never point the local URL
# at a hosted database.
set -euo pipefail
DB="${1:?empty local database URL required}"
case "$DB" in *supabase.co*|*pooler.supabase.com*) echo "refusing: looks like a hosted Supabase database" >&2; exit 2;; esac
ENV_FILE="${SCHOLAR_AGENT_ENV:-$HOME/.scholar-agent.env}"
if [ -f "$ENV_FILE" ]; then set -a; . "$ENV_FILE"; set +a; fi
: "${SUPABASE_ACCESS_TOKEN:?}" "${SUPABASE_PROJECT_REF:?}"
cd "$(dirname "$0")/../.."
OUT="$(mktemp -d)"

psql "$DB" -q -v ON_ERROR_STOP=1 -f scripts/db/supabase-stub.sql
scripts/db/replay-migrations.sh "$DB" >/dev/null
psql "$DB" -At -f scripts/db/schema-fingerprint.sql | sort > "$OUT/replay.txt"

python3 -I - "$OUT/prod.txt" <<'PY'
import json, os, sys, urllib.request
q = open("scripts/db/schema-fingerprint.sql").read().rstrip().rstrip(";")
body = json.dumps({"query": "begin read only;\n" + q + ";\ncommit;"}).encode()
req = urllib.request.Request(
    f"https://api.supabase.com/v1/projects/{os.environ['SUPABASE_PROJECT_REF']}/database/query",
    data=body, method="POST",
    headers={"Authorization": "Bearer " + os.environ["SUPABASE_ACCESS_TOKEN"], "Content-Type": "application/json"})
rows = json.load(urllib.request.urlopen(req, timeout=60))
open(sys.argv[1], "w").write("\n".join(sorted(r["line"] for r in rows)) + "\n")
PY

echo "replay: $(wc -l < "$OUT/replay.txt") lines   production: $(wc -l < "$OUT/prod.txt") lines"
diff "$OUT/replay.txt" "$OUT/prod.txt" || true
