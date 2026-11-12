const formatadorDeReais = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const formatadorDeDataHora = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "medium",
  timeZone: "America/Bahia",
});
const formatadorDeHora = new Intl.DateTimeFormat("pt-BR", { timeStyle: "medium", timeZone: "America/Bahia" });

export function formatarPreco(centavos: number | null | undefined): string {
  return centavos === null || centavos === undefined ? "--" : formatadorDeReais.format(centavos / 100);
}

export function formatarDataHora(iso: string | null | undefined): string {
  return iso ? formatadorDeDataHora.format(new Date(iso)) : "--";
}

export function formatarHora(iso: string | null | undefined): string {
  if (!iso) return "--";
  const data = new Date(iso);
  return `${formatadorDeHora.format(data)}.${String(data.getMilliseconds()).padStart(3, "0")}`;
}

export function tempoRelativo(iso: string | null | undefined, agora = Date.now()): string {
  if (!iso) return "nunca";
  const segundos = Math.round((agora - new Date(iso).getTime()) / 1000);
  if (segundos < 5) return "agora mesmo";
  if (segundos < 60) return `há ${segundos} s`;
  const minutos = Math.round(segundos / 60);
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.round(minutos / 60);
  return horas < 24 ? `há ${horas} h` : `há ${Math.round(horas / 24)} dias`;
}

export function formatarMs(milissegundos: number | null | undefined): string {
  if (milissegundos === null || milissegundos === undefined) return "--";
  if (milissegundos >= 1000) return `${(milissegundos / 1000).toFixed(2)} s`;
  return `${milissegundos.toFixed(milissegundos < 10 ? 2 : 0)} ms`;
}

export function reaisParaCentavos(texto: string): number | null {
  const limpo = texto.replace(/[^\d,.]/g, "").replace(/\./g, "").replace(",", ".");
  const valor = Number(limpo);
  return limpo && Number.isFinite(valor) ? Math.round(valor * 100) : null;
}
