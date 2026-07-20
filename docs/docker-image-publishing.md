# Docker 镜像发布

本文说明如何构建 OpenExcel 镜像、推送到腾讯云容器镜像仓库，以及在服务器上拉取并启动。

镜像仓库地址：

```text
ccr.ccs.tencentyun.com/openexcel/openexcel
```

## 本地构建并推送

在项目根目录执行。建议使用明确的版本标签，例如 `v1.0.0`：

```powershell
docker build -t openexcel:local .
docker tag openexcel:local ccr.ccs.tencentyun.com/openexcel/openexcel:v1.0.0
```

登录腾讯云镜像仓库：

```powershell
docker login ccr.ccs.tencentyun.com
```

登录成功后推送镜像：

```powershell
docker push ccr.ccs.tencentyun.com/openexcel/openexcel:v1.0.0
```

后续发布新版本时，使用新的标签重复构建、打标签和推送，例如：

```powershell
docker build -t ccr.ccs.tencentyun.com/openexcel/openexcel:v1.0.0 .
docker push ccr.ccs.tencentyun.com/openexcel/openexcel:v1.0.0
```

## 服务器拉取并启动

先将项目的 Compose 文件和 `.env` 放到服务器，然后登录镜像仓库：

```bash
docker login ccr.ccs.tencentyun.com
```

在服务器 `.env` 中指定要使用的镜像版本：

```env
OPENEXCEL_IMAGE=ccr.ccs.tencentyun.com/openexcel/openexcel:v1.0.0
```

然后拉取并启动：

```bash
docker compose pull
docker compose up -d --no-build
```

镜像构建阶段会生成 Prisma Client，容器启动阶段会自动执行数据库迁移。服务器不需要手动运行迁移命令；如果迁移失败，容器会停止启动并在日志中显示原因。

`OPENEXCEL_IMAGE` 是 Docker Compose 选择远程镜像所需的变量，不是模型配置。模型相关的 `MODEL_BASE_URL`、`MODEL_API_KEY` 和 `MODEL_NAME` 仍然配置在同一个 `.env` 文件中。

镜像仓库登录凭据不需要写入 `.env`，通过 `docker login` 配置即可。

查看容器状态：

```bash
docker compose ps
docker compose logs -f server
```
