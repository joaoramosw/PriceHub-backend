# syntax=docker/dockerfile:1.7
ARG APP=catalog-service

FROM node:24-alpine AS base
RUN apk add --no-cache openssl && corepack enable
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /repo

FROM base AS build
ARG APP
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm fetch --frozen-lockfile
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile --offline --filter "${APP}..."
RUN pnpm --filter "${APP}..." run build
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm --filter "${APP}" deploy --legacy --prod /out

FROM node:24-alpine AS runtime
RUN apk add --no-cache openssl
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 3002
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=6 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3002}/health" > /dev/null || exit 1
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && exec node dist/server.js"]
