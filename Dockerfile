FROM node:22-alpine AS build

RUN corepack enable && corepack prepare pnpm@10.20.0 --activate
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/core/package.json packages/core/
COPY packages/agent/package.json packages/agent/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/

RUN pnpm install --frozen-lockfile --ignore-scripts

COPY packages/server/prisma ./packages/server/prisma
RUN pnpm --filter @openexcel/server exec prisma generate --schema prisma/schema.prisma
RUN pnpm --filter @openexcel/server exec prisma generate --schema prisma/postgresql/schema.prisma
RUN pnpm --filter @openexcel/server exec prisma generate --schema prisma/mysql/schema.prisma

COPY packages/core/src ./packages/core/src
COPY packages/agent/src ./packages/agent/src
COPY packages/server/src ./packages/server/src
COPY packages/server/scripts ./packages/server/scripts
COPY packages/web/src ./packages/web/src
COPY packages/web/index.html ./packages/web/
COPY packages/web/tsconfig.json ./packages/web/
COPY packages/web/vite.config.ts ./packages/web/
COPY templates ./templates

RUN pnpm --filter @openexcel/web build

FROM node:22-alpine

RUN corepack enable && corepack prepare pnpm@10.20.0 --activate
WORKDIR /app
ENV OPENEXCEL_STORAGE_ROOT=/app/.data/storage \
    DATABASE_URL=file:/app/.data/openexcel.db

COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/packages/server/package.json ./packages/server/
COPY --from=build /app/packages/core/package.json ./packages/core/
COPY --from=build /app/packages/agent/package.json ./packages/agent/
COPY --from=build /app/packages/web/package.json ./packages/web/

RUN pnpm install --prod --frozen-lockfile --ignore-scripts

COPY --from=build /app/packages/server/prisma ./packages/server/prisma
COPY --from=build /app/packages/server/scripts ./packages/server/scripts
COPY --from=build /app/packages/server/src ./packages/server/src
COPY --from=build /app/packages/core/src ./packages/core/src
COPY --from=build /app/packages/agent/src ./packages/agent/src
COPY --from=build /app/packages/web/dist ./packages/web/dist
COPY --from=build /app/templates ./templates

RUN mkdir -p /app/.data \
  && sed -i 's/\r$//' /app/packages/server/scripts/docker-entrypoint.sh \
  && chmod +x /app/packages/server/scripts/docker-entrypoint.sh

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/api/health || exit 1

ENTRYPOINT ["/app/packages/server/scripts/docker-entrypoint.sh"]
CMD ["pnpm", "--filter", "@openexcel/server", "start"]
