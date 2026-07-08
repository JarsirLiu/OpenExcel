FROM node:22-alpine AS build

RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/core/package.json packages/core/
COPY packages/agent/package.json packages/agent/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/

RUN pnpm install --frozen-lockfile --ignore-scripts

# 复制 prisma schema 后再生成 client
COPY packages/server/prisma ./packages/server/prisma
RUN pnpm --filter @openexcel/server exec prisma generate --schema prisma/schema.prisma
RUN pnpm --filter @openexcel/server exec prisma generate --schema prisma/postgresql/schema.prisma
RUN pnpm --filter @openexcel/server exec prisma generate --schema prisma/mysql/schema.prisma

# 只复制源码，避免 pnpm symlink 污染构建上下文
COPY packages/core/src ./packages/core/src
COPY packages/agent/src ./packages/agent/src
COPY packages/server/src ./packages/server/src
COPY packages/server/scripts ./packages/server/scripts
COPY packages/web/src ./packages/web/src
COPY packages/web/index.html ./packages/web/
COPY packages/web/tsconfig.json ./packages/web/
COPY packages/web/vite.config.ts ./packages/web/
COPY packages/web/vitest.config.ts ./packages/web/
COPY config ./config

RUN pnpm --filter @openexcel/web build

FROM node:22-alpine

RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# server 源码（tsx 运行时编译）和 prisma 生成文件
COPY --from=build /app/packages/server/prisma ./packages/server/prisma
COPY --from=build /app/packages/server/src ./packages/server/src
# workspace 依赖源码（tsx 按需转译）
COPY --from=build /app/packages/core/src ./packages/core/src
COPY --from=build /app/packages/agent/src ./packages/agent/src
# 构建好的前端
COPY --from=build /app/packages/web/dist ./packages/web/dist
# 模型配置
COPY --from=build /app/config ./config

COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/packages/server/package.json ./packages/server/
COPY --from=build /app/packages/core/package.json ./packages/core/
COPY --from=build /app/packages/agent/package.json ./packages/agent/
COPY --from=build /app/packages/web/package.json ./packages/web/
COPY --from=build /app/node_modules ./node_modules

EXPOSE 4000

CMD ["pnpm", "--filter", "@openexcel/server", "start"]