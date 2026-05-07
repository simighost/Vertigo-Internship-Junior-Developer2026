#!/bin/sh
set -eu

DB_FILE="${DB_FILE_NAME:-prediction_market.db}"
DB_DIR="$(dirname "$DB_FILE")"
SHOULD_SEED="false"

mkdir -p "$DB_DIR"

if [ ! -f "$DB_FILE" ]; then
  SHOULD_SEED="true"
fi

bun run db:migrate

if [ "${FORCE_SEED:-false}" = "true" ]; then
  bun run db:reset
elif [ "${SEED_DATABASE:-false}" = "true" ] && [ "$SHOULD_SEED" = "true" ]; then
  bun run db:seed
fi

exec bun index.ts
