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
DATABASE_URL=file:../../../.data/openexcel.db
```

生产 Docker Compose 会覆盖为：

```env
DATABASE_URL=file:/app/.data/openexcel.db
```

不要把真实 API Key 提交到 Git。`.env` 和 `config/config.toml` 已被忽略；旧的 TOML 配置不再被程序读取。

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

Vite 会把 `/api` 请求代理到 `http://127.0.0.1:4000`。开发模式启动前会自动执行 Prisma 迁移。

## 常用命令

```bash
pnpm build          # 构建 Web 前端
pnpm typecheck      # 全仓 TypeScript 检查
pnpm test           # 全部测试
pnpm test:server    # Server 测试
pnpm test:web       # Web 测试
pnpm db:migrate     # 执行数据库迁移
```

## Docker 部署

### 使用当前源码构建

确保服务器上存在 `.env`，并填写模型配置：

```bash
cp .env.example .env
vim .env
```

构建并启动：

```bash
docker compose build --pull
docker compose up -d
```

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

### 使用 GHCR 镜像

Compose 同时声明了 `image` 和 `build`。如果使用已经发布的镜像，可以执行：

```bash
docker compose pull
docker compose up -d
```

如果修改了源码，必须重新构建并发布镜像，或者在服务器上执行 `docker compose build --pull`，否则服务器可能仍然运行旧的 `latest` 镜像。

## Nginx 反向代理

项目默认监听容器端口 `4000`。本项目配套的 Gateway Nginx 配置位于 `D:\learn\xx\nginx`，其中 `gateway.yml` 的上游配置示例：

```yaml
services:
  - domain: your-domain.example
    upstream: host.docker.internal:4000
    ssl: true
```

Nginx 配置需要关闭代理缓冲，以便 AI 对话的 HTTP 流式响应及时到达浏览器。当前配套脚本已经包含：

```nginx
proxy_http_version 1.1;
proxy_buffering off;
proxy_cache off;
proxy_read_timeout 300s;
```

部署 Gateway：

```bash
cd D:\learn\xx\nginx
docker compose up -d --build
```

聊天接口是 HTTP `POST` 流式响应，不是 WebSocket，因此 OpenExcel 服务不需要设置 `websocket: true`。

## 生产建议

- 使用固定镜像 tag 或 digest，不要长期依赖 `latest`。
- 将 `MODEL_API_KEY` 放在服务器 Secret 或权限受限的 `.env` 中。
- 生产环境使用 HTTPS 和 Nginx，不要长期直接暴露 `4000` 端口。
- SQLite 适合单实例部署；多副本部署应切换到 PostgreSQL 或 MySQL。
- 生产环境应限制 CORS 来源，并定期备份 `openexcel-data` volume。

## 对话失败排查

1. 检查服务端环境变量：

   ```bash
   docker compose exec server printenv MODEL_BASE_URL MODEL_NAME
   ```

2. 检查服务端日志：

   ```bash
   docker compose logs --tail=200 server
   ```

3. 直接检查 API：

   ```bash
   curl -i http://127.0.0.1:4000/api/health
   ```

4. 如果直连 `4000` 可以对话、域名访问不行，重点检查 Nginx 的 `proxy_buffering off`、上游地址和证书域名。

5. 如果健康检查正常但对话报模型配置错误，检查 `MODEL_BASE_URL`、`MODEL_API_KEY` 和 `MODEL_NAME` 是否在容器内存在，并确认运行的是最新镜像。
