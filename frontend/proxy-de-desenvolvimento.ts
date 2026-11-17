/**
 * Proxy do `npm run dev`: imita o gateway nginx (porta 8080) para que os micro-frontends usem
 * os mesmos caminhos relativos no desenvolvimento e no Docker.
 */
import type { ProxyOptions } from "vite";

const servico = (porta: number, prefixo: string): ProxyOptions => ({
  target: `http://localhost:${porta}`,
  changeOrigin: true,
  rewrite: (caminho) => caminho.replace(new RegExp(`^${prefixo}`), ""),
});

const loja = (porta: number, prefixo: string): ProxyOptions => ({
  ...servico(porta, prefixo),
  headers: { "X-Forwarded-Prefix": prefixo },
});

export const PROXY_DE_DESENVOLVIMENTO: Record<string, ProxyOptions> = {
  "/api/ingestao": servico(8001, "/api/ingestao"),
  "/api/catalogo": servico(8002, "/api/catalogo"),
  "/api/log": servico(8003, "/api/log"),
  "/loja/biofarma": loja(8101, "/loja/biofarma"),
  "/loja/farmaazul": loja(8102, "/loja/farmaazul"),
  "/loja/drogapopular": loja(8103, "/loja/drogapopular"),
};
