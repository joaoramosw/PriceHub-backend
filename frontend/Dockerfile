# Constrói os quatro micro-frontends e os serve com Nginx, cada um na sua porta.
FROM node:22-alpine AS construcao
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
RUN npm ci --no-audit --no-fund && npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=construcao /app/apps/comparador/dist /usr/share/nginx/html/comparador
COPY --from=construcao /app/apps/lojas/dist /usr/share/nginx/html/lojas
COPY --from=construcao /app/apps/monitor/dist /usr/share/nginx/html/monitor
COPY --from=construcao /app/apps/vitrines/dist /usr/share/nginx/html/vitrines
EXPOSE 5173 5174 5175 5176
