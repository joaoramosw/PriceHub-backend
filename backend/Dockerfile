# syntax=docker/dockerfile:1.7

FROM node:24-alpine AS base
RUN apk add --no-cache openssl && corepack enable
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /repo

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm fetch --frozen-lockfile
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile --offline
RUN NODE_OPTIONS=--max-old-space-size=1536 pnpm --workspace-concurrency=1 --filter "./packages/**" --filter "./apps/**" run build
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    for app in farmacia-sim ingestion-service catalog-service query-service; do \
      pnpm --filter "$app" deploy --legacy --prod "/out/$app" || exit 1; \
    done

FROM node:24-alpine AS runtime
RUN apk add --no-cache openssl
ENV NODE_ENV=production
WORKDIR /app
USER node
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && exec node dist/server.js"]

FROM runtime AS farmacia-sim
COPY --from=build --chown=node:node /out/farmacia-sim ./
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=6 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-4000}/health" > /dev/null || exit 1

FROM runtime AS ingestion-service
COPY --from=build --chown=node:node /out/ingestion-service ./
EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=6 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3001}/health" > /dev/null || exit 1

FROM runtime AS catalog-service
COPY --from=build --chown=node:node /out/catalog-service ./
EXPOSE 3002
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=6 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3002}/health" > /dev/null || exit 1

FROM runtime AS query-service
COPY --from=build --chown=node:node /out/query-service ./
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=6 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/health" > /dev/null || exit 1
