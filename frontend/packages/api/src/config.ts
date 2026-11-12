/**
 * Endereços dos microsserviços e dos micro-frontends.
 * Podem ser trocados por variáveis de ambiente do Vite (arquivo .env de cada app).
 */
const ambiente = import.meta.env;

export const URLS_DOS_SERVICOS = {
  ingestao: ambiente.VITE_URL_MS_INGESTAO ?? "http://localhost:8001",
  catalogo: ambiente.VITE_URL_MS_CATALOGO ?? "http://localhost:8002",
  log: ambiente.VITE_URL_MS_LOG ?? "http://localhost:8003",
} as const;

export const URLS_DAS_FARMACIAS: Record<IdDaFarmacia, string> = {
  biofarma: ambiente.VITE_URL_FARMACIA_BIOFARMA ?? "http://localhost:8101",
  farmaazul: ambiente.VITE_URL_FARMACIA_FARMAAZUL ?? "http://localhost:8102",
  drogapopular: ambiente.VITE_URL_FARMACIA_DROGAPOPULAR ?? "http://localhost:8103",
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
