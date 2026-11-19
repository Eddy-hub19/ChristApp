# ChristApp

Christ App for reading the Bible, sharing verses, and building Christian community.

## Monorepo

npm workspaces, one root `package-lock.json`:

| Path | Package | What |
| --- | --- | --- |
| `apps/backend` | `@christapp/backend` | NestJS + Prisma backend |
| `apps/web` | `@christapp/web` | Next.js frontend |
| `packages/*` | `@christapp/*` | shared libraries (none yet) |

`npm install` at the root only. `npm run dev` starts backend and web together; `npm run build`, `lint`, `test` and `check` run in every workspace. Add a dependency with `npm install <dep> -w @christapp/backend`.

## Docker: dev and prod

| File | Env file | Scripts | What |
| --- | --- | --- | --- |
| `docker-compose.dev.yml` | `.env.development` | `docker:*` | PostgreSQL 18, backend (migrations on start), web; ports published on `127.0.0.1` |
| `docker-compose.prod.yml` | `.env.production` | `docker:prod:*` | PostgreSQL (not published), one-shot `migrate`, backend, web, log rotation |

Env files are not tracked by git; create them yourself with the keys the compose files and apps read.

### Network and nginx

Backend and web of both stacks join the external Docker network `web` (created automatically by the scripts, name in the `config` block of `package.json`). Put nginx on the same network and proxy to the container aliases:

| Stack | Backend (port 3001) | Web (port 3000) |
| --- | --- | --- |
| prod | `christapp-prod-backend` | `christapp-prod-web` |
| dev | `christapp-dev-backend` | `christapp-dev-web` |

The database is only on the stack-private `internal` network.

Production runs on one domain (`christapp.ddns.net`): the site on `/`, the backend on `/v1/api/`. nginx strips the `/v1/api` prefix, so the backend routes stay unchanged. The browser talks to the backend in two ways: HTTP through the web app (`/api/nest`, same origin, no CORS) and Socket.IO directly, which is why the socket path is configurable:

| Variable (baked into the web image) | Value |
| --- | --- |
| `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SITE_URL` | `https://christapp.ddns.net` |
| `NEXT_PUBLIC_API_URL` | `https://christapp.ddns.net/v1/api` |
| `NEXT_PUBLIC_WS_URL` | `https://christapp.ddns.net` |
| `NEXT_PUBLIC_SOCKET_PATH` | `/v1/api/socket.io` |

Backend variables: `CORS_ORIGIN` and `FRONTEND_URL` = `https://christapp.ddns.net`. The Google OAuth redirect URI to register is `https://christapp.ddns.net/api/auth/google/callback`.

```
map $http_upgrade $connection_upgrade {
  default upgrade;
  '' close;
}

server {
  listen 443 ssl;
  server_name christapp.ddns.net;

  location /v1/api/ {
    proxy_pass http://christapp-prod-backend:3001/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_read_timeout 3600s;
  }

  location / {
    proxy_pass http://christapp-prod-web:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

The trailing slash in `proxy_pass http://christapp-prod-backend:3001/;` is what strips the prefix. Keep it.

### Dev

```
npm run docker:up
```

Web: http://localhost:3000, backend: http://localhost:3001 (`/health`), Postgres: `127.0.0.1:5432`.

| Script | Purpose |
| --- | --- |
| `npm run docker:up` / `docker:down` | start / stop |
| `npm run docker:deps` | only Postgres, run backend and web on the host with `npm run dev` |
| `npm run docker:reset` | stop and delete volumes (database included) |
| `npm run docker:logs` | backend logs |
| `npm run docker:migrate` | apply pending Prisma migrations |
| `npm run docker:psql` | psql shell |
| `npm run docker:restore` | load the newest dump from `backups/` (or `-- <file>`): `.sql`, `.sql.gz` or `pg_dump -Fc`, then apply pending migrations |
| `npm run docker:dump` | `pg_dump -Fc` of the local database into `backups/` |
| `SOURCE_DATABASE_URL=<url> npm run docker:dump:remote` | dump a remote database into `backups/` and check that the file is readable |
| `npm run docker:build` | build backend and web images (`docker-bake.hcl`) |
| `IMAGE_TAG=vX.Y.Z npm run docker:push` | push images to GHCR |

### Prod (on the server)

```
npm run docker:prod:up
```

`docker:prod:up` builds the images on the server with `IMAGE_TAG` (for example `local`), runs migrations, then starts everything. `NEXT_PUBLIC_*` values and the proxy target are baked into the web image at build time, so changing them needs a new `up`.

| Script | Purpose |
| --- | --- |
| `npm run docker:prod:up` | build on this machine and start |
| `npm run docker:prod:deploy` | pull images by `IMAGE_TAG` from the registry and start (no build) |
| `npm run docker:prod:migrate` | apply pending migrations |
| `npm run docker:prod:down` / `logs` | stop / backend logs |
| `npm run docker:prod:psql` | psql shell |
| `npm run docker:prod:dump` / `docker:prod:restore` | backup into `backups/` / restore the newest file from `backups/` (or `-- <file>`) |

Release through GitHub: a `v*` tag runs `.github/workflows/deploy.yml`: images are pushed to GHCR, then `docker:prod:deploy` runs against the server over SSH (`DOCKER_HOST`). Required GitHub secrets: `PRODUCTION_ENV` (full content of `.env.production`), `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS`, `DEPLOY_USER`, `DEPLOY_HOST`; variables: `NEXT_PUBLIC_*`. The health check reads `API_HOST` from `.env.production`. Run `docker login ghcr.io` once on the server. Rollback: deploy an older tag with `IMAGE_TAG=<previous> npm run docker:prod:deploy`.

The backend keeps presence, games and sockets in process memory, so it runs as a single instance until that state moves to Redis.

## Backups folder

`backups/` in the repo root is where dumps live: `docker:dump` and `docker:prod:dump` write here, `docker:restore` and `docker:prod:restore` read from here. Its contents are ignored by git and by Docker builds; only `backups/.gitkeep` is tracked.

## Loading real data

1. Put the dump (`.dump`, `.sql` or `.sql.gz`) into `backups/`.
2. `npm run docker:deps`
3. `npm run docker:restore` (takes the newest file; pass `-- backups/<name>` to choose one).

A full dump (schema + data, including `_prisma_migrations`) replaces the database contents and migrations are then a no-op.
For a data-only dump run `npm run docker:migrate` first, then restore.

## Migrations

Prisma migrations live in `apps/backend/prisma/migrations`. Create a new one from `apps/backend` with `npx prisma migrate dev --name <name>`; see `apps/backend/prisma/MIGRATIONS.md`.
