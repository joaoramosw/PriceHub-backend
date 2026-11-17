import { useEffect, useRef, useState } from "react";

import { apiDoCatalogo, useConsulta } from "@pricehub/api";
import { Carregando, MensagemDeErro, Vazio, formatarPreco, tempoRelativo } from "@pricehub/ui";

import type { EventoDoCatalogo } from "./App";
import { PrecosDasFarmacias } from "./PrecosDasFarmacias";
import { aoClicarNoLink } from "./rotas";

const ATRASO_DA_BUSCA_MS = 300;
const DURACAO_DO_DESTAQUE_MS = 2500;

function useValorComAtraso<T>(valor: T, atrasoMs: number): T {
  const [atrasado, setAtrasado] = useState(valor);
  useEffect(() => {
    const temporizador = window.setTimeout(() => setAtrasado(valor), atrasoMs);
    return () => window.clearTimeout(temporizador);
  }, [valor, atrasoMs]);
  return atrasado;
}

export function ListaDeMedicamentos({ versao, ultimoEvento }: { versao: number; ultimoEvento?: EventoDoCatalogo }) {
  const [textoDaBusca, setTextoDaBusca] = useState("");
  const [categoria, setCategoria] = useState<string>();
  const [destacados, setDestacados] = useState<Set<string>>(new Set());
  const busca = useValorComAtraso(textoDaBusca.trim(), ATRASO_DA_BUSCA_MS);
  const versaoDasCategorias = ultimoEvento?.tipo === "catalogo.medicamento.cadastrado" ? versao : 0;

  const medicamentos = useConsulta(() => apiDoCatalogo.listarMedicamentos(busca, categoria), [busca, categoria, versao]);
  const categorias = useConsulta(() => apiDoCatalogo.categorias(), [versaoDasCategorias]);
  const estatisticas = useConsulta(() => apiDoCatalogo.estatisticas(), [versao]);

  // Marca por alguns segundos o cartão que acabou de mudar de preço.
  const temporizadores = useRef(new Map<string, number>());
  useEffect(() => {
    const id = ultimoEvento?.dados.medicamentoId;
    if (!id || ultimoEvento?.tipo !== "catalogo.oferta.atualizada") return;
    setDestacados((atuais) => new Set(atuais).add(id));
    window.clearTimeout(temporizadores.current.get(id));
    temporizadores.current.set(
      id,
      window.setTimeout(() => setDestacados((atuais) => new Set([...atuais].filter((item) => item !== id))), DURACAO_DO_DESTAQUE_MS),
    );
  }, [ultimoEvento]);

  const lista = medicamentos.dados ?? [];
  const catalogoVazio = !medicamentos.carregando && !busca && !categoria && lista.length === 0 && !medicamentos.erro;
  const totais = estatisticas.dados;

  return (
    <>
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-6">
          <h1 className="text-2xl font-semibold text-slate-900">Compare o preço nas três farmácias</h1>
          <p className="mt-1 text-sm text-slate-600">
            Os preços chegam das lojas por eventos e mudam aqui assim que a farmácia altera. Clique num preço para abrir o produto no site da
            loja.
          </p>
          <label className="mt-4 block max-w-2xl">
            <span className="sr-only">Buscar medicamento</span>
            <input
              value={textoDaBusca}
              onChange={(evento) => setTextoDaBusca(evento.target.value)}
              placeholder="Nome, princípio ativo ou fabricante (ex.: losartana)"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none placeholder:text-slate-500 focus-visible:border-slate-900 focus-visible:ring-2 focus-visible:ring-slate-200"
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            {[undefined, ...(categorias.dados ?? [])].map((nome) => (
              <button
                key={nome ?? "todas"}
                onClick={() => setCategoria(nome === categoria ? undefined : nome)}
                aria-pressed={nome === categoria}
                className={`inline-flex min-h-10 items-center rounded-md border px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
                  nome === categoria ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {nome ?? "Todas as categorias"}
              </button>
            ))}
          </div>
          {totais && (
            <p className="mt-4 text-xs text-slate-600 tabular-nums">
              {totais.medicamentos} medicamentos · {totais.farmacias} farmácias · {totais.ofertasDisponiveis} ofertas ·{" "}
              {totais.registrosDeHistorico} preços no histórico
            </p>
          )}
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-6">
        <MensagemDeErro erro={medicamentos.erro} />
        {medicamentos.carregando && !medicamentos.dados && <Carregando texto="Carregando os preços..." />}

        {catalogoVazio && (
          <Vazio titulo="Nenhuma farmácia conectada ainda">
            Os medicamentos aparecem aqui quando uma farmácia sobe e envia o catálogo dela ao PriceHub. Veja quais farmácias estão no ar em{" "}
            <a className="underline" href="/monitor/filas">
              Filas e serviços
            </a>
            .
          </Vazio>
        )}

        {!catalogoVazio && !medicamentos.carregando && lista.length === 0 && !medicamentos.erro && (
          <Vazio titulo="Nenhum medicamento encontrado">Nenhum nome, princípio ativo ou fabricante contém "{busca}".</Vazio>
        )}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {lista.map((medicamento) => {
            const caminho = `/medicamento/${medicamento.id}`;
            return (
              <article
                key={medicamento.id}
                className={`flex flex-col rounded-lg border bg-white p-4 transition-colors duration-200 ${
                  destacados.has(medicamento.id) ? "border-amber-400" : "border-slate-200"
                }`}
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <a
                      href={caminho}
                      onClick={aoClicarNoLink(caminho)}
                      className="font-semibold text-slate-900 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                    >
                      {medicamento.nome}
                    </a>
                    <p className="text-sm text-slate-600">
                      {medicamento.principioAtivo} · {medicamento.apresentacao}
                    </p>
                  </div>
                  {medicamento.categoria && (
                    <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{medicamento.categoria}</span>
                  )}
                </div>

                <PrecosDasFarmacias ofertas={medicamento.ofertas} />

                <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-600">
                  <span className="tabular-nums">
                    {medicamento.economiaMaximaCentavos
                      ? `${formatarPreco(medicamento.economiaMaximaCentavos)} entre a mais cara e a mais barata`
                      : `atualizado ${tempoRelativo(medicamento.atualizadoEm)}`}
                  </span>
                  <a
                    href={caminho}
                    onClick={aoClicarNoLink(caminho)}
                    className="inline-flex min-h-10 shrink-0 items-center font-medium text-slate-900 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                  >
                    Histórico de preços
                  </a>
                </div>
              </article>
            );
          })}
        </div>
      </main>
    </>
  );
}
