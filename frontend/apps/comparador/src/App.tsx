import { useEffect, useState } from "react";

import { apiDoCatalogo, URLS_DOS_APPS, useConsulta, useFluxoDeEventos } from "@pricehub/api";
import {
  BarraDeNavegacao,
  Carregando,
  IndicadorDeConexao,
  MensagemDeErro,
  PilhaDeAvisos,
  Vazio,
  formatarPreco,
  tempoRelativo,
  temaDa,
  useAvisos,
} from "@pricehub/ui";

import { PainelDoMedicamento } from "./PainelDoMedicamento";

interface EventoDoCatalogo {
  tipo: string;
  correlationId: string;
  dados: {
    medicamentoId?: string;
    medicamentoNome?: string;
    farmaciaNome?: string;
    situacao?: string;
    precoAnteriorCentavos?: number | null;
    precoAtualCentavos?: number;
    nome?: string;
  };
}

const ATRASO_DA_BUSCA_MS = 300;
const DURACAO_DO_DESTAQUE_MS = 4000;

function useValorComAtraso<T>(valor: T, atrasoMs: number): T {
  const [atrasado, setAtrasado] = useState(valor);
  useEffect(() => {
    const temporizador = window.setTimeout(() => setAtrasado(valor), atrasoMs);
    return () => window.clearTimeout(temporizador);
  }, [valor, atrasoMs]);
  return atrasado;
}

export function App() {
  const [textoDaBusca, setTextoDaBusca] = useState("");
  const [categoria, setCategoria] = useState<string>();
  const [selecionado, setSelecionado] = useState<string>();
  const [versaoDoDetalhe, setVersaoDoDetalhe] = useState(0);
  const [destacados, setDestacados] = useState<Set<string>>(new Set());
  const busca = useValorComAtraso(textoDaBusca.trim(), ATRASO_DA_BUSCA_MS);
  const { avisos, avisar } = useAvisos();

  const medicamentos = useConsulta(() => apiDoCatalogo.listarMedicamentos(busca, categoria), [busca, categoria]);
  const categorias = useConsulta(() => apiDoCatalogo.categorias(), []);
  const estatisticas = useConsulta(() => apiDoCatalogo.estatisticas(), []);

  const destacar = (medicamentoId: string) => {
    setDestacados((atuais) => new Set(atuais).add(medicamentoId));
    window.setTimeout(() => {
      setDestacados((atuais) => {
        const copia = new Set(atuais);
        copia.delete(medicamentoId);
        return copia;
      });
    }, DURACAO_DO_DESTAQUE_MS);
  };

  // O comparador não consulta as farmácias: ele reage aos eventos publicados pelo ms-catalogo.
  const conexao = useFluxoDeEventos<EventoDoCatalogo>(apiDoCatalogo.urlDoTempoReal, (tipo, evento) => {
    medicamentos.recarregar();
    estatisticas.recarregar();
    if (tipo === "catalogo.medicamento.cadastrado") categorias.recarregar();
    const { medicamentoId } = evento.dados;
    if (medicamentoId) {
      destacar(medicamentoId);
      if (medicamentoId === selecionado) setVersaoDoDetalhe((versao) => versao + 1);
    }
    if (tipo === "catalogo.oferta.atualizada" && evento.dados.situacao === "preco-alterado") {
      avisar({
        tom: "info",
        titulo: `Preço atualizado: ${evento.dados.medicamentoNome}`,
        texto: `${evento.dados.farmaciaNome}: ${formatarPreco(evento.dados.precoAnteriorCentavos)} → ${formatarPreco(evento.dados.precoAtualCentavos)}`,
      });
    }
  });

  const lista = medicamentos.dados ?? [];
  const catalogoVazio = !medicamentos.carregando && !busca && !categoria && lista.length === 0 && !medicamentos.erro;
  const totais = estatisticas.dados;

  return (
    <div className="min-h-screen">
      <BarraDeNavegacao atual="comparador" extra={<IndicadorDeConexao situacao={conexao} />} />

      <div className="bg-slate-900 text-white">
        <div className="mx-auto max-w-7xl px-4 py-8">
          <h1 className="text-2xl font-semibold">Compare o preço do seu medicamento</h1>
          <p className="mt-1 text-sm text-slate-300">
            Ofertas de farmácias diferentes reunidas em um só lugar, da mais barata para a mais cara.
          </p>
          <input
            value={textoDaBusca}
            onChange={(evento) => setTextoDaBusca(evento.target.value)}
            placeholder="Buscar por nome, princípio ativo ou fabricante (ex.: losartana)"
            className="mt-5 w-full rounded-xl border-0 bg-white px-4 py-3 text-slate-900 outline-none ring-4 ring-white/10 placeholder:text-slate-400 focus:ring-white/30"
          />
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <button
              onClick={() => setCategoria(undefined)}
              className={`rounded-full px-3 py-1 ${!categoria ? "bg-white text-slate-900" : "bg-white/10 hover:bg-white/20"}`}
            >
              Todas
            </button>
            {(categorias.dados ?? []).map((nome) => (
              <button
                key={nome}
                onClick={() => setCategoria(nome === categoria ? undefined : nome)}
                className={`rounded-full px-3 py-1 ${nome === categoria ? "bg-white text-slate-900" : "bg-white/10 hover:bg-white/20"}`}
              >
                {nome}
              </button>
            ))}
          </div>
          {totais && (
            <p className="mt-4 text-xs text-slate-400">
              {totais.medicamentos} medicamentos · {totais.farmacias} farmácias · {totais.ofertasDisponiveis} ofertas disponíveis ·{" "}
              {totais.registrosDeHistorico} preços no histórico
            </p>
          )}
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-6">
        <MensagemDeErro erro={medicamentos.erro} />
        {medicamentos.carregando && !medicamentos.dados && <Carregando />}

        {catalogoVazio && (
          <Vazio titulo="O catálogo ainda está vazio">
            Nenhuma farmácia enviou dados ao PriceHub. Suba uma farmácia simulada (ex.: <code>docker compose up farmacia-biofarma</code>) e
            as ofertas aparecem aqui sozinhas, assim que os eventos forem processados. Acompanhe pelo{" "}
            <a className="underline" href={URLS_DOS_APPS.monitor}>
              monitor de eventos
            </a>
            .
          </Vazio>
        )}

        {!catalogoVazio && !medicamentos.carregando && lista.length === 0 && !medicamentos.erro && (
          <Vazio titulo="Nenhum medicamento encontrado">Tente outro termo de busca.</Vazio>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {lista.map((medicamento) => {
            const tema = temaDa(medicamento.farmaciaMaisBarataId);
            return (
              <button
                key={medicamento.id}
                onClick={() => setSelecionado(medicamento.id)}
                className={`flex flex-col rounded-xl border bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                  destacados.has(medicamento.id) ? "border-amber-400 ring-4 ring-amber-100" : "border-slate-200"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">{medicamento.nome}</p>
                    <p className="text-xs text-slate-500">{medicamento.apresentacao}</p>
                  </div>
                  {medicamento.categoria && <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{medicamento.categoria}</span>}
                </div>
                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <p className="text-xs text-slate-500">a partir de</p>
                    <p className="text-2xl font-bold text-slate-900">{formatarPreco(medicamento.menorPrecoCentavos)}</p>
                    {medicamento.farmaciaMaisBarata && (
                      <p className={`flex items-center gap-1.5 text-xs font-medium ${tema.texto}`}>
                        <span className={`h-2 w-2 rounded-full ${tema.ponto}`} /> {medicamento.farmaciaMaisBarata}
                      </p>
                    )}
                  </div>
                  <div className="text-right text-xs text-slate-500">
                    <p>
                      {medicamento.totalDeOfertas} oferta{medicamento.totalDeOfertas === 1 ? "" : "s"}
                    </p>
                    {!!medicamento.economiaMaximaCentavos && (
                      <p className="font-medium text-emerald-700">economize até {formatarPreco(medicamento.economiaMaximaCentavos)}</p>
                    )}
                  </div>
                </div>
                <p className="mt-3 border-t border-slate-100 pt-2 text-[11px] text-slate-400">atualizado {tempoRelativo(medicamento.atualizadoEm)}</p>
              </button>
            );
          })}
        </div>
      </main>

      {selecionado && (
        <PainelDoMedicamento medicamentoId={selecionado} versao={versaoDoDetalhe} aoFechar={() => setSelecionado(undefined)} />
      )}
      <PilhaDeAvisos avisos={avisos} />
    </div>
  );
}
