/** Ganchos (hooks) React compartilhados: consulta com recarga e fluxo de eventos SSE. */
import { useCallback, useEffect, useRef, useState } from "react";

export interface EstadoDaConsulta<T> {
  dados: T | undefined;
  erro: Error | undefined;
  carregando: boolean;
  recarregar: () => void;
}

/** Executa ``carregar`` ao montar, quando as dependências mudam e, opcionalmente, a cada ``intervaloMs``. */
export function useConsulta<T>(carregar: () => Promise<T>, dependencias: unknown[] = [], intervaloMs?: number): EstadoDaConsulta<T> {
  const [dados, setDados] = useState<T>();
  const [erro, setErro] = useState<Error>();
  const [carregando, setCarregando] = useState(true);
  const carregarAtual = useRef(carregar);
  carregarAtual.current = carregar;

  const recarregar = useCallback(() => {
    carregarAtual
      .current()
      .then((resultado) => {
        setDados(resultado);
        setErro(undefined);
      })
      .catch((falha: Error) => setErro(falha))
      .finally(() => setCarregando(false));
  }, []);

  useEffect(() => {
    setCarregando(true);
    recarregar();
    if (!intervaloMs) return undefined;
    const temporizador = window.setInterval(recarregar, intervaloMs);
    return () => window.clearInterval(temporizador);
  }, [...dependencias, intervaloMs]);

  return { dados, erro, carregando, recarregar };
}

export type SituacaoDaConexao = "conectando" | "conectado" | "desconectado";

/**
 * Assina um fluxo Server-Sent Events. ``aoReceber`` é chamado com o nome do evento
 * (ex.: "catalogo.oferta.atualizada") e o corpo já convertido de JSON.
 */
export function useFluxoDeEventos<T = unknown>(url: string, aoReceber: (tipo: string, dados: T) => void, ativo = true): SituacaoDaConexao {
  const [situacao, setSituacao] = useState<SituacaoDaConexao>("conectando");
  const aoReceberAtual = useRef(aoReceber);
  aoReceberAtual.current = aoReceber;

  useEffect(() => {
    if (!ativo) return undefined;
    const fonte = new EventSource(url);
    const tratar = (mensagem: MessageEvent<string>) => {
      try {
        aoReceberAtual.current(mensagem.type, JSON.parse(mensagem.data) as T);
      } catch {
        /* mensagem fora do formato: ignorada */
      }
    };
    const tiposConhecidos = [
      "ingestao.oferta.recebida",
      "ingestao.oferta.removida",
      "ingestao.oferta.descartada",
      "ingestao.coleta.realizada",
      "ingestao.farmacia.indisponivel",
      "catalogo.medicamento.cadastrado",
      "catalogo.oferta.atualizada",
      "catalogo.oferta.indisponivel",
      "catalogo.oferta.nao-correspondida",
      "catalogo.visao.atualizada",
    ];
    tiposConhecidos.forEach((tipo) => fonte.addEventListener(tipo, tratar as EventListener));
    fonte.onopen = () => setSituacao("conectado");
    fonte.onerror = () => setSituacao(fonte.readyState === EventSource.CLOSED ? "desconectado" : "conectando");
    return () => fonte.close();
  }, [url, ativo]);

  return situacao;
}
