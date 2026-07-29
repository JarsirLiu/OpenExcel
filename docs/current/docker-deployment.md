# Docker Deployment

> Status: Current
>
> Source of truth: `Dockerfile`, `docker-compose.yml`, and
> `packages/server/scripts/docker-entrypoint.sh`.

This guide covers local image builds, publishing the OpenExcel image to the
Tencent Cloud Container Registry, and deploying a published image to a server.

## Runtime Model

The supplied Compose configuration currently runs the server with SQLite:

- The database URL is `/app/.data/openexcel.db`.
- Uploaded files are stored under `/app/.data/storage`.
- Both paths are persisted by the `openexcel-data` Docker volume.
- The container entrypoint runs Prisma migrations before starting the server.
- The server listens on port `4000` by default.

PostgreSQL is supported by the server, but the supplied Compose file is the
SQLite deployment profile. Multi-instance deployments should use PostgreSQL
with a deployment-specific Compose or orchestration configuration.

## Required Configuration

Copy the example environment file and set the model configuration:

```bash
cp .env.example .env
```

The `.env` file must contain:

```env
MODEL_BASE_URL=https://your-model-endpoint.example/v1
MODEL_API_KEY=your-api-key
MODEL_NAME=your-model-name
```

For a local image, keep the default:

```env
OPENEXCEL_IMAGE=openexcel:local
```

For a published image, set `OPENEXCEL_IMAGE` to the exact image tag to deploy.

## Local Build and Run

Build the image from the repository root:

```bash
docker build -t openexcel:local .
```

Start the local image with Compose:

```bash
docker compose up -d
```

Check the container and health endpoint:

```bash
docker compose ps
curl http://127.0.0.1:4000/api/health
```

View server logs:

```bash
docker compose logs -f server
```

## Publish an Image

The current project registry is:

```text
ccr.ccs.tencentyun.com/openexcel/openexcel
```

Use an immutable version tag for each release:

```bash
docker build -t openexcel:local .
docker tag openexcel:local ccr.ccs.tencentyun.com/openexcel/openexcel:v1.0.0
```

Log in to the registry and push the image:

```bash
docker login ccr.ccs.tencentyun.com
docker push ccr.ccs.tencentyun.com/openexcel/openexcel:v1.0.0
```

For the next release, use a new tag:

```bash
docker build -t ccr.ccs.tencentyun.com/openexcel/openexcel:v1.0.1 .
docker push ccr.ccs.tencentyun.com/openexcel/openexcel:v1.0.1
```

Registry credentials are managed by `docker login`; do not put them in `.env`.

## Deploy a Published Image

Copy `docker-compose.yml` and `.env` to the server. Set the image tag in the
server's `.env`:

```env
OPENEXCEL_IMAGE=ccr.ccs.tencentyun.com/openexcel/openexcel:v1.0.0
```

Log in to the registry, pull the selected image, and start Compose without a
local build:

```bash
docker login ccr.ccs.tencentyun.com
docker compose pull
docker compose up -d --no-build
```

The container runs database migrations before starting the server. Do not run
database migrations manually on the deployment host. If migration fails, the
entrypoint exits and the container does not start the server.

After deployment:

```bash
docker compose ps
docker compose logs -f server
curl http://127.0.0.1:4000/api/health
```

## Data Safety

The `openexcel-data` volume contains the SQLite database and uploaded files.
Removing the container does not remove this volume. Do not run the following
command unless the data is intentionally being deleted:

```bash
docker compose down -v
```

For production backups, back up the Docker volume or its storage through the
host's volume-management process before replacing images or hosts.
