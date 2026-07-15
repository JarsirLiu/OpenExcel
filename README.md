# OpenExcel

OpenExcel 是一个基于 React、Fastify、Prisma 和 AI SDK 的多工作表 Excel 工作台，支持工作区、工作簿、表格编辑和 AI 对话式操作。

## 环境要求

- Node.js 22+
- pnpm 10.20.0
- Docker Engine 及 Docker Compose（使用 Docker 部署时）

## 配置环境变量

复制示例文件：

```bash
cp .env.example .env
```

Windows PowerShell：

```powershell
Copy-Item .env.example .env
```

编辑 `.env`：

```env
MODEL_BASE_URL=https://your-model-endpoint.example/v1
MODEL_API_KEY=your-api-key
MODEL_NAME=your-model-name
```

模型配置是必需的。服务端启动后第一次执行对话或生成标题时，会校验这三个变量。

数据库默认使用 SQLite：

```env
DATABASE_PROVIDER=sqlite
```

SQLite 的数据库文件默认位于项目根目录的 `.data/openexcel.db`。Docker Compose 会将同名数据库保存在 `/app/.data/openexcel.db`，并通过 volume 持久化。

如果切换到 PostgreSQL 或 MySQL，再配置对应的连接串：

```env
DATABASE_PROVIDER=postgresql
DATABASE_URL=postgresql://user:password@db-host:5432/openexcel
```

## 本地启动

安装依赖：

```bash
pnpm install
```

启动 Web 和 Server：

```bash
pnpm dev
```

默认地址：

- Web：`http://localhost:5173`
- API：`http://localhost:4000`
- 健康检查：`http://localhost:4000/api/health`

Vite 会把 `/api` 请求代理到 `http://127.0.0.1:4000`。开发模式启动前会自动生成 Prisma Client 并执行数据库迁移。

## 常用命令

```bash
pnpm build          # 构建 Web 前端
pnpm typecheck      # 全仓 TypeScript 检查
pnpm test           # 全部测试
pnpm test:server    # Server 测试
pnpm test:web       # Web 测试
pnpm db:prepare     # 生成 Prisma Client 并执行数据库迁移
pnpm db:migrate     # 执行数据库迁移
```

## Docker 部署

复制 `.env.example` 并填写模型配置：

```bash
cp .env.example .env
vim .env
```

构建镜像：

```bash
docker build -t openexcel:local .
```

启动容器：

```bash
docker compose up -d
```

镜像构建阶段会生成 Prisma Client，容器启动阶段会自动执行数据库迁移；不需要在服务器上手动运行迁移命令。

查看状态和日志：

```bash
docker compose ps
docker compose logs -f server
```

健康检查：

```bash
curl http://127.0.0.1:4000/api/health
```

SQLite 数据保存在 Docker volume `openexcel-data` 中。删除容器不会删除该 volume；不要执行 `docker compose down -v`，除非确认要删除数据库。

## Git 提交检查

提交时 Husky 会执行 lint-staged、类型检查和 commitlint。Git 客户端或 IDE 启动提交时，需要让它继承 Node.js 和 pnpm 的 PATH；项目 hook 不依赖固定的 Node.js 安装目录。也可以先执行 `corepack enable` 启用项目使用的 pnpm。
