#!/bin/sh
set -e

# 确保数据卷目录 node 用户可写
chown node:nodejs /app/.data

echo "[entrypoint] Running database migrations..."
pnpm --filter @openexcel/server db:migrate

echo "[entrypoint] Starting server..."
exec su-exec node "$@"