FROM node:22-alpine AS build

RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/core/package.json packages/core/
COPY packages/agent/package.json packages/agent/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/

RUN pnpm install --frozen-lockfile --ignore-scripts

COPY packages/server/prisma ./packages/server/prisma
RUN pnpm --filter @openexcel/server exec prisma generate --schema prisma/schema.prisma

COPY packages/core/src ./packages/core/src
COPY packages/agent/src ./packages/agent/src
COPY packages/server/src ./packages/server/src
COPY packages/server/scripts ./packages/server/scripts
COPY packages/web/src ./packages/web/src
COPY packages/web/index.html ./packages/web/
COPY packages/web/tsconfig.json ./packages/web/
COPY packages/web/vite.config.ts ./packages/web/
COPY packages/web/vitest.config.ts ./packages/web/

RUN pnpm --filter @openexcel/web build

FROM node:22-alpine

RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

RUN addgroup -g 1001 -S nodejs && adduser node nodejs

COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/packages/server/package.json ./packages/server/
COPY --from=build /app/packages/core/package.json ./packages/core/
COPY --from=build /app/packages/agent/package.json ./packages/agent/
COPY --from=build /app/packages/web/package.json ./packages/web/

RUN pnpm install --prod --frozen-lockfile --ignore-scripts

COPY --from=build /app/packages/server/prisma ./packages/server/prisma
COPY --from=build /app/packages/server/scripts ./packages/server/scripts
RUN chmod +x /app/packages/server/scripts/docker-entrypoint.sh
COPY --from=build /app/packages/server/src ./packages/server/src
COPY --from=build /app/packages/core/src ./packages/core/src
COPY --from=build /app/packages/agent/src ./packages/agent/src
COPY --from=build /app/packages/web/dist ./packages/web/dist

RUN mkdir -p /app/.data && chown -R node:nodejs /app

# 预缓存 prisma 引擎，避免首次 db:migrate 下载
RUN pnpm --filter @openexcel/server exec prisma --version

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/api/health || exit 1

USER node

ENTRYPOINT ["/app/packages/server/scripts/docker-entrypoint.sh"]
CMD ["pnpm", "--filter", "@openexcel/server", "start"]