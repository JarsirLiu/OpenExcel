#!/bin/sh
set -e

echo "[entrypoint] Running database migrations..."
pnpm --filter @openexcel/server db:migrate

echo "[entrypoint] Starting server..."
exec "$@"