#!/usr/bin/env bash
# Builds a fresh local Supabase database from the repo: base schemas, then
# every migration in timestamp order, with the two workarounds the history
# still needs (see PRODUCT_AUDIT / STATUS T9):
#   1. profiles.authentic_id exists in production but no repo SQL creates it;
#      20260811000000 references it.
#   2. 20260812120000 needs premium_requests, which 20260812180000 creates;
#      it is applied right after that migration instead.
# Usage: scripts/db/replay-migrations.sh "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
# Local / CI only. Never point this at production.
set -euo pipefail
DB="${1:?database URL required}"
case "$DB" in *supabase.co*|*pooler.supabase.com*) echo "refusing: looks like a hosted Supabase database" >&2; exit 2;; esac
cd "$(dirname "$0")/../.."
run() { psql "$DB" -q -v ON_ERROR_STOP=1 --single-transaction -f "$1" >/dev/null; echo "ok   $(basename "$1")"; }
for f in supabase/schema.sql supabase/schema_ai_engine.sql supabase/schema_store.sql supabase/schema_user_settings.sql; do run "$f"; done
for f in supabase/migrations/*.sql; do
  b=$(basename "$f")
  case "$b" in
    20260811000000_code_review_fixes.sql)
      psql "$DB" -q -v ON_ERROR_STOP=1 -c "alter table public.profiles add column if not exists authentic_id text;" ;;
    20260812120000_premium_request_integrity.sql)
      echo "defer $b (applied after 20260812180000)"; continue ;;
  esac
  run "$f"
  if [ "$b" = "20260812180000_two_router_architecture.sql" ]; then run supabase/migrations/20260812120000_premium_request_integrity.sql; fi
done
psql "$DB" -q -c "notify pgrst, 'reload schema';" >/dev/null
echo "replay complete"
