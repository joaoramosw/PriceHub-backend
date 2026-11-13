/**
 * Endereços dos microsserviços e dos micro-frontends.
 * Podem ser trocados por variáveis de ambiente do Vite (arquivo .env de cada app).
 */
const ambiente = import.meta.env;
const bff = ambiente.VITE_URL_BFF ?? "http://localhost:8000";

export const URLS_DOS_SERVICOS = {
  ingestao: ambiente.VITE_URL_MS_INGESTAO ?? `${bff}/ingestao`,
  catalogo: ambiente.VITE_URL_MS_CATALOGO ?? `${bff}/catalogo`,
  consulta: ambiente.VITE_URL_MS_CONSULTA ?? `${bff}/consulta`,
  log: ambiente.VITE_URL_MS_LOG ?? `${bff}/log`,
} as const;

export const URLS_DAS_FARMACIAS: Record<IdDaFarmacia, string> = {
  biofarma: ambiente.VITE_URL_FARMACIA_BIOFARMA ?? `${bff}/farmacias/biofarma`,
  farmaazul: ambiente.VITE_URL_FARMACIA_FARMAAZUL ?? `${bff}/farmacias/farmaazul`,
  drogapopular: ambiente.VITE_URL_FARMACIA_DROGAPOPULAR ?? `${bff}/farmacias/drogapopular`,
};

export const URLS_DOS_APPS = {
  comparador: ambiente.VITE_URL_APP_COMPARADOR ?? "http://localhost:5173",
  lojas: ambiente.VITE_URL_APP_LOJAS ?? "http://localhost:5174",
  monitor: ambiente.VITE_URL_APP_MONITOR ?? "http://localhost:5175",
  vitrines: ambiente.VITE_URL_APP_VITRINES ?? "http://localhost:5176",
} as const;

export type IdDaFarmacia = "biofarma" | "farmaazul" | "drogapopular";

export const FARMACIAS: { id: IdDaFarmacia; nome: string; cor: string; perfil: string }[] = [
  { id: "biofarma", nome: "BioFarma Verde", cor: "emerald", perfil: "caro" },
  { id: "farmaazul", nome: "FarmaAzul Confiança", cor: "blue", perfil: "mediano" },
  { id: "drogapopular", nome: "DrogaPopular Express", cor: "red", perfil: "barato" },
];
