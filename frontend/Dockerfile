# Gateway do PriceHub: constrói os dois micro-frontends (comparador e monitor) e os serve com
# Nginx na porta 8080, junto com o roteamento por prefixo para os microsserviços e as farmácias.
FROM node:22-alpine AS construcao
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json proxy-de-desenvolvimento.ts ./
COPY packages ./packages
COPY apps ./apps
RUN npm ci --no-audit --no-fund && npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=construcao /app/apps/comparador/dist /usr/share/nginx/html/comparador
COPY --from=construcao /app/apps/monitor/dist /usr/share/nginx/html/monitor
EXPOSE 8080
