#!/usr/bin/env bash
# Run SQL against the Supabase project over HTTPS.
#
# Why this exists rather than `psql "$DATABASE_URL"`:
#
#   1. Supabase's direct endpoint (db.<ref>.supabase.co) publishes no A record
#      — it is IPv6-only. Anything on an IPv4-only network cannot resolve it.
#   2. This environment's egress allows HTTPS only; TCP/5432 is blocked
#      outright, so even the IPv4 pooler is unreachable from here.
#
# The Management API's query endpoint runs SQL over 443, which is the one path
# that works. Applications still connect normally over the pooler — this is a
# tooling workaround, not how the app talks to its database.
#
# Usage:
#   scripts/supabase-sql.sh -f path/to/file.sql
#   scripts/supabase-sql.sh -c "select 1;"
#
# Reads SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF from .env (gitignored).

set -euo pipefail

cd "$(dirname "$0")/.."
[ -f .env ] || { echo "error: .env not found" >&2; exit 1; }
set -a; . ./.env; set +a
: "${SUPABASE_ACCESS_TOKEN:?not set in .env}"
: "${SUPABASE_PROJECT_REF:?not set in .env}"

case "${1:-}" in
  -f) SQL="$(cat "$2")" ;;
  -c) SQL="$2" ;;
  *)  echo "usage: $0 -f <file.sql> | -c \"<sql>\"" >&2; exit 2 ;;
esac

# json.dumps for the payload; curl for transport. Python's urllib does not pick
# up this environment's HTTPS proxy and gets a 403, so it encodes only.
PAYLOAD="$(SQL="$SQL" python3 -c 'import json,os;print(json.dumps({"query":os.environ["SQL"]}))')"

HTTP_BODY="$(mktemp)"
trap 'rm -f "$HTTP_BODY"' EXIT

CODE="$(curl -sS --max-time 120 -o "$HTTP_BODY" -w '%{http_code}' -X POST \
  "https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  --data-binary "$PAYLOAD")"

cat "$HTTP_BODY"
echo

# The endpoint reports SQL errors in a 4xx body rather than by failing the
# request, so the status has to be checked explicitly or a failed migration
# looks like a successful one.
[ "$CODE" -ge 200 ] && [ "$CODE" -lt 300 ] || { echo "HTTP $CODE — statement failed" >&2; exit 1; }
