/**
 * Classes Tailwind por farmácia. Ficam escritas por extenso para que o Tailwind as encontre na
 * varredura do código (classes montadas dinamicamente não seriam geradas).
 */
export interface TemaDaFarmacia {
  ponto: string;
  texto: string;
  fundoClaro: string;
  borda: string;
  botao: string;
  cabecalho: string;
}

export const TEMAS_DAS_FARMACIAS: Record<string, TemaDaFarmacia> = {
  biofarma: {
    ponto: "bg-emerald-500",
    texto: "text-emerald-700",
    fundoClaro: "bg-emerald-50",
    borda: "border-emerald-200",
    botao: "bg-emerald-600 hover:bg-emerald-700",
    cabecalho: "bg-emerald-700",
  },
  farmaazul: {
    ponto: "bg-blue-500",
    texto: "text-blue-700",
    fundoClaro: "bg-blue-50",
    borda: "border-blue-200",
    botao: "bg-blue-600 hover:bg-blue-700",
    cabecalho: "bg-blue-700",
  },
  drogapopular: {
    ponto: "bg-red-500",
    texto: "text-red-700",
    fundoClaro: "bg-red-50",
    borda: "border-red-200",
    botao: "bg-red-600 hover:bg-red-700",
    cabecalho: "bg-red-700",
  },
};

const TEMA_NEUTRO: TemaDaFarmacia = {
  ponto: "bg-slate-400",
  texto: "text-slate-700",
  fundoClaro: "bg-slate-50",
  borda: "border-slate-200",
  botao: "bg-slate-700 hover:bg-slate-800",
  cabecalho: "bg-slate-800",
};

export function temaDa(farmaciaId: string | null | undefined): TemaDaFarmacia {
  return (farmaciaId && TEMAS_DAS_FARMACIAS[farmaciaId]) || TEMA_NEUTRO;
}

/** Cor por família de evento, usada na linha do tempo e no feed ao vivo. */
export function corDoEvento(tipo: string): string {
  if (tipo.startsWith("catalogo.oferta.atualizada")) return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (tipo.startsWith("catalogo.medicamento")) return "bg-teal-100 text-teal-800 border-teal-200";
  if (tipo.includes("indisponivel") || tipo.includes("nao-correspondida") || tipo.includes("descartada"))
    return "bg-amber-100 text-amber-800 border-amber-200";
  if (tipo.startsWith("catalogo.")) return "bg-cyan-100 text-cyan-800 border-cyan-200";
  if (tipo.startsWith("ingestao.coleta")) return "bg-violet-100 text-violet-800 border-violet-200";
  return "bg-indigo-100 text-indigo-800 border-indigo-200";
}
