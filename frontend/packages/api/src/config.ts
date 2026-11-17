/**
 * Endereços usados pelos micro-frontends.
 *
 * Tudo passa pelo gateway (nginx em http://localhost:8080), então os caminhos são relativos:
 * /api/<serviço> leva ao microsserviço e /loja/<farmácia>/ ao site da farmácia. No
 * desenvolvimento (npm run dev) o proxy do Vite faz o mesmo papel.
 */
const ambiente = import.meta.env;

export const URLS_DOS_SERVICOS = {
  ingestao: "/api/ingestao",
  catalogo: "/api/catalogo",
  log: "/api/log",
} as const;

/** Swagger de cada serviço, acessado direto na porta dele (o Swagger não funciona atrás de prefixo). */
const host = ambiente.VITE_HOST_DOS_SERVICOS ?? "http://localhost";
export const DOCUMENTACAO_DOS_SERVICOS: Record<string, string> = {
  "ms-ingestao": `${host}:8001`,
  "ms-catalogo": `${host}:8002`,
  "ms-log": `${host}:8003`,
  "farmacia-biofarma": `${host}:8101`,
  "farmacia-farmaazul": `${host}:8102`,
  "farmacia-drogapopular": `${host}:8103`,
};

export const URLS_DOS_APPS = {
  comparador: "/",
  parceiras: "/parceiras",
  monitor: "/monitor/",
} as const;

export type IdDaFarmacia = "biofarma" | "farmaazul" | "drogapopular";

export interface FarmaciaParceira {
  id: IdDaFarmacia;
  nome: string;
  integracao: "webhook" | "polling";
  formato: string;
}

export const FARMACIAS: FarmaciaParceira[] = [
  { id: "biofarma", nome: "BioFarma Verde", integracao: "webhook", formato: "JSON em camelCase, preço em reais" },
  { id: "farmaazul", nome: "FarmaAzul Confiança", integracao: "webhook", formato: "JSON paginado em snake_case, preço em centavos" },
  { id: "drogapopular", nome: "DrogaPopular Express", integracao: "polling", formato: "arquivo legado com ETag, texto em maiúsculas" },
];

export const urlDaLoja = (farmaciaId: IdDaFarmacia) => `/loja/${farmaciaId}/`;
export const urlDoAdminDaLoja = (farmaciaId: IdDaFarmacia) => `/loja/${farmaciaId}/admin`;
