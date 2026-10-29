#!/usr/bin/env bash
# Production smoke suite wrapper (see scripts/smoke-prod.mjs for the checks).
# Usage: scripts/smoke-prod.sh [--setup] [--base URL]
# Reads credentials from ~/.scholar-agent.env (never printed).
set -euo pipefail
ENV_FILE="${SCHOLAR_AGENT_ENV:-$HOME/.scholar-agent.env}"
if [ -f "$ENV_FILE" ]; then set -a; . "$ENV_FILE"; set +a; fi
# Route Node's fetch through an outbound proxy when one is configured.
if [ -n "${HTTPS_PROXY:-}${https_proxy:-}" ]; then export NODE_USE_ENV_PROXY=1; fi
exec node "$(dirname "$0")/smoke-prod.mjs" "$@"
