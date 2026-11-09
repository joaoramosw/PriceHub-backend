FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY comparador-web/package.json comparador-web/pnpm-lock.yaml ./comparador-web/
WORKDIR /repo/comparador-web
RUN pnpm install --frozen-lockfile
COPY frontend /repo/frontend
COPY comparador-web ./
ARG VITE_API_URL=http://127.0.0.1:3000
ARG VITE_ENABLE_DEMO=false
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_ENABLE_DEMO=$VITE_ENABLE_DEMO
RUN pnpm build

FROM nginx:alpine AS runtime
COPY comparador-web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/comparador-web/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 CMD wget -qO- http://127.0.0.1:8080/health || exit 1
