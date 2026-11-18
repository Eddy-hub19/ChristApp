# syntax=docker/dockerfile:1.7
ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-slim AS base
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /repo

FROM base AS manifests
COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/backend/prisma apps/backend/prisma
COPY apps/backend/prisma.config.ts apps/backend/prisma.config.ts
COPY apps/web/package.json apps/web/package.json

FROM manifests AS build
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN npm ci --workspace @christapp/backend --include-workspace-root --no-audit --no-fund
COPY apps/backend apps/backend
RUN npm run build --workspace @christapp/backend

FROM manifests AS prod-deps
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN npm ci --workspace @christapp/backend --omit=dev --no-audit --no-fund \
    && mkdir -p apps/backend/node_modules

FROM base AS production
ENV NODE_ENV=production \
    PORT=3001
WORKDIR /repo/apps/backend
COPY --from=prod-deps --chown=node:node /repo/node_modules /repo/node_modules
COPY --from=prod-deps --chown=node:node /repo/apps/backend/node_modules ./node_modules
COPY --from=build --chown=node:node /repo/apps/backend/dist ./dist
COPY --chown=node:node apps/backend/package.json apps/backend/prisma.config.ts ./
COPY --chown=node:node apps/backend/prisma ./prisma
RUN mkdir -p uploads && chown node:node uploads
USER node
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/src/main.js"]
