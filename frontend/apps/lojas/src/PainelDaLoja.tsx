import { useState } from "react";

import {
  apiDaFarmacia,
  apiDaIngestao,
  ErroDaApi,
  URLS_DAS_FARMACIAS,
  URLS_DOS_APPS,
  useConsulta,
  type IdDaFarmacia,
  type ProdutoDaLoja,
  type ResultadoDaOperacao,
} from "@pricehub/api";
import {
  Botao,
  Cartao,
  Carregando,
  MensagemDeErro,
  Selo,
  TituloDeSecao,
  Vazio,
  formatarPreco,
  reaisParaCentavos,
  tempoRelativo,
  temaDa,
  type Aviso,
} from "@pricehub/ui";

import { FormularioDeProduto } from "./FormularioDeProduto";
import { PropagacaoAoVivo, type Acompanhamento } from "./PropagacaoAoVivo";

interface Propriedades {
  farmaciaId: IdDaFarmacia;
  avisar: (aviso: Omit<Aviso, "id">) => void;
  aoMudarIntegracao: () => void;
}

function CelulaDePreco({ produto, aoSalvar }: { produto: ProdutoDaLoja; aoSalvar: (centavos: number) => Promise<void> }) {
  const [texto, setTexto] = useState((produto.precoCentavos / 100).toFixed(2).replace(".", ","));
  const [salvando, setSalvando] = useState(false);
  const novoValor = reaisParaCentavos(texto);
  const alterado = novoValor !== null && novoValor !== produto.precoCentavos;

  const salvar = async () => {
    if (!alterado || novoValor === null) return;
    setSalvando(true);
    try {
      await aoSalvar(novoValor);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="flex items-center justify-end gap-1.5">
      <span className="text-xs text-slate-400">R$</span>
      <input
        value={texto}
        onChange={(evento) => setTexto(evento.target.value)}
        onKeyDown={(evento) => evento.key === "Enter" && salvar()}
        className="w-20 rounded-md border border-slate-300 px-2 py-1 text-right text-sm"
        aria-label={`Preço de ${produto.nomeComercial}`}
      />
      <Botao variante={alterado ? "primario" : "secundario"} disabled={!alterado || salvando} onClick={salvar}>
        {salvando ? "..." : "Salvar"}
      </Botao>
    </div>
  );
}

export function PainelDaLoja({ farmaciaId, avisar, aoMudarIntegracao }: Propriedades) {
  const api = apiDaFarmacia(farmaciaId);
  const tema = temaDa(farmaciaId);
  const loja = useConsulta(() => api.informacoes(), [farmaciaId]);
  const produtos = useConsulta(() => api.listarProdutos(), [farmaciaId]);
  const [emEdicao, setEmEdicao] = useState<ProdutoDaLoja | "novo">();
  const [acompanhamento, setAcompanhamento] = useState<Acompanhamento>();
  const [erroDaAcao, setErroDaAcao] = useState<Error>();

  const acompanhar = (descricao: string, resultado: ResultadoDaOperacao | { correlationId: string; notificacao?: string }) => {
    setAcompanhamento({
      descricao,
      farmaciaId,
      correlationId: resultado.correlationId,
      modo: loja.dados?.modoDeIntegracao ?? "webhook",
      iniciadoEm: new Date().toISOString(),
    });
    produtos.recarregar();
    loja.recarregar();
  };

  const executar = async (acao: () => Promise<void>) => {
    setErroDaAcao(undefined);
    try {
      await acao();
    } catch (erro) {
      setErroDaAcao(erro as Error);
    }
  };

  const alterarPreco = (produto: ProdutoDaLoja) => async (centavos: number) =>
    executar(async () => {
      const { dados } = await api.alterarPreco(produto.id, centavos);
      avisar({ tom: "sucesso", titulo: "Preço alterado na farmácia", texto: `${produto.nomeComercial}: ${formatarPreco(dados.precoAnteriorCentavos)} → ${formatarPreco(centavos)}` });
      acompanhar(`Preço de ${produto.nomeComercial} para ${formatarPreco(centavos)}`, dados);
    });

  const remover = (produto: ProdutoDaLoja) =>
    executar(async () => {
      if (!window.confirm(`Remover ${produto.nomeComercial} da ${loja.dados?.nome}?`)) return;
      const { dados } = await api.remover(produto.id);
      acompanhar(`Remoção de ${produto.nomeComercial}`, dados);
    });

  const restaurar = () =>
    executar(async () => {
      const { dados } = await api.restaurar();
      avisar({ tom: "info", titulo: "Carga inicial restaurada", texto: `${dados.produtos} produtos` });
      acompanhar("Restauração da carga inicial", dados);
    });

  const sincronizarAgora = () =>
    executar(async () => {
      const { dados } = await apiDaIngestao.sincronizar(farmaciaId);
      avisar({
        tom: "info",
        titulo: "Sincronização feita pelo ms-ingestao",
        texto: `${dados.ofertasPublicadas} ofertas publicadas, ${dados.ofertasSemAlteracao} sem alteração (${dados.duracaoMs} ms)`,
      });
      aoMudarIntegracao();
      acompanhar("Sincronização sob demanda", { correlationId: dados.correlationId });
    });

  const indisponivel = loja.erro instanceof ErroDaApi && loja.erro.status === 0;

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Cartao>
        {indisponivel ? (
          <Vazio titulo={`A farmácia ${farmaciaId} está fora do ar`}>
            Esta loja não respondeu em {URLS_DAS_FARMACIAS[farmaciaId]}. Para a demonstração das etapas do capítulo de resultados, suba-a
            com <code>docker compose up -d farmacia-{farmaciaId}</code>.
          </Vazio>
        ) : (
          <>
            <TituloDeSecao
              titulo={loja.dados?.nome ?? farmaciaId}
              subtitulo={
                loja.dados && (
                  <span className="flex flex-wrap items-center gap-2">
                    <Selo tom="info">integração: {loja.dados.modoDeIntegracao}</Selo>
                    <span>API nativa: {loja.dados.rotasNativas.join(", ")}</span>
                    <span>versão do catálogo {loja.dados.versaoDoCatalogo}</span>
                  </span>
                )
              }
              acoes={
                <>
                  <Botao onClick={() => setEmEdicao("novo")} className={`${tema.botao} text-white`}>
                    + Novo produto
                  </Botao>
                  <Botao variante="secundario" onClick={sincronizarAgora} title="Pede ao ms-ingestao para buscar o catálogo agora">
                    Sincronizar agora
                  </Botao>
                  <Botao variante="secundario" onClick={restaurar}>
                    Restaurar carga inicial
                  </Botao>
                </>
              }
            />
            <div className="mb-4 flex flex-wrap gap-3 text-xs">
              <a className="text-slate-600 underline" href={`${URLS_DOS_APPS.vitrines}/${farmaciaId}`} target="_blank" rel="noreferrer">
                Abrir vitrine da loja
              </a>
              <a className="text-slate-600 underline" href={`${URLS_DAS_FARMACIAS[farmaciaId]}/docs`} target="_blank" rel="noreferrer">
                API da loja (Swagger)
              </a>
            </div>
            <MensagemDeErro erro={erroDaAcao ?? produtos.erro} />
            {produtos.carregando && !produtos.dados && <Carregando />}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 text-left text-xs text-slate-500 uppercase">
                  <tr>
                    <th className="py-2 pr-3">Código</th>
                    <th className="py-2 pr-3">Produto</th>
                    <th className="py-2 pr-3">Fabricante</th>
                    <th className="py-2 pr-3 text-right">Preço</th>
                    <th className="py-2 pr-3">Atualizado</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {(produtos.dados ?? []).map((produto) => (
                    <tr key={`${produto.id}-${produto.precoCentavos}`} className="border-b border-slate-100 align-middle">
                      <td className="py-2 pr-3 font-mono text-xs text-slate-500">{produto.codigo}</td>
                      <td className="py-2 pr-3">
                        <p className="font-medium text-slate-900">{produto.nomeComercial}</p>
                        <p className="text-xs text-slate-500">
                          {produto.principioAtivo} {produto.concentracao} · {produto.apresentacao}
                        </p>
                      </td>
                      <td className="py-2 pr-3 text-xs text-slate-600">{produto.fabricante}</td>
                      <td className="py-2 pr-3">
                        <CelulaDePreco produto={produto} aoSalvar={alterarPreco(produto)} />
                      </td>
                      <td className="py-2 pr-3 text-xs text-slate-500">{tempoRelativo(produto.atualizadoEm)}</td>
                      <td className="py-2 text-right whitespace-nowrap">
                        <Botao variante="fantasma" onClick={() => setEmEdicao(produto)}>
                          Editar
                        </Botao>
                        <Botao variante="fantasma" className="text-red-600" onClick={() => remover(produto)}>
                          Remover
                        </Botao>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Cartao>

      <PropagacaoAoVivo acompanhamento={acompanhamento} />

      {emEdicao && (
        <FormularioDeProduto
          farmaciaId={farmaciaId}
          produto={emEdicao === "novo" ? undefined : emEdicao}
          aoFechar={() => setEmEdicao(undefined)}
          aoSalvar={(resultado, descricao) => {
            setEmEdicao(undefined);
            avisar({ tom: "sucesso", titulo: descricao });
            acompanhar(descricao, resultado);
          }}
        />
      )}
    </div>
  );
}
