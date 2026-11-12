import { useEffect, useState } from "react";

import { apiDaFarmacia, FARMACIAS, URLS_DAS_FARMACIAS, useConsulta, type IdDaFarmacia, type ProdutoDaLoja } from "@pricehub/api";
import { BarraDeNavegacao, Carregando, MensagemDeErro, Vazio, formatarPreco, tempoRelativo, temaDa } from "@pricehub/ui";

/**
 * Vitrines públicas das três farmácias simuladas (produto secundário do trabalho).
 * Cada vitrine lê o catálogo da própria loja; ela não conhece o PriceHub.
 */
const INTERVALO_DE_ATUALIZACAO_MS = 4000;
const SLOGANS: Record<IdDaFarmacia, string> = {
  biofarma: "Cuidado clínico e tradição",
  farmaazul: "Confiança de grande rede, genéricos com desconto",
  drogapopular: "Preço baixo todo dia",
};

function useCaminho(): [string[], (caminho: string) => void] {
  const [caminho, setCaminho] = useState(window.location.pathname);
  useEffect(() => {
    const aoVoltar = () => setCaminho(window.location.pathname);
    window.addEventListener("popstate", aoVoltar);
    return () => window.removeEventListener("popstate", aoVoltar);
  }, []);
  const navegar = (novo: string) => {
    window.history.pushState(null, "", novo);
    setCaminho(novo);
    window.scrollTo(0, 0);
  };
  return [caminho.split("/").filter(Boolean), navegar];
}

function Imagem({ produto, className }: { produto: ProdutoDaLoja; className: string }) {
  const [falhou, setFalhou] = useState(false);
  if (!produto.imagem || falhou) {
    return <div className={`${className} grid place-items-center bg-slate-100 text-3xl text-slate-300`}>💊</div>;
  }
  return <img src={`/imagens/${produto.imagem}`} alt={produto.nomeComercial} onError={() => setFalhou(true)} className={`${className} object-cover object-center`} />;
}

function Vitrine({ loja, navegar }: { loja: IdDaFarmacia; navegar: (caminho: string) => void }) {
  const tema = temaDa(loja);
  const farmacia = FARMACIAS.find((item) => item.id === loja)!;
  const produtos = useConsulta(() => apiDaFarmacia(loja).listarProdutos(), [loja], INTERVALO_DE_ATUALIZACAO_MS);
  const [busca, setBusca] = useState("");
  const termo = busca.trim().toLowerCase();
  const visiveis = (produtos.dados ?? []).filter((produto) => `${produto.nomeComercial} ${produto.principioAtivo}`.toLowerCase().includes(termo));

  return (
    <>
      <div className={`${tema.cabecalho} text-white`}>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-5">
          <div>
            <p className="text-xl font-bold">{farmacia.nome}</p>
            <p className="text-sm opacity-80">{SLOGANS[loja]}</p>
          </div>
          <input
            value={busca}
            onChange={(evento) => setBusca(evento.target.value)}
            placeholder="Buscar nesta farmácia"
            className="ml-auto w-full max-w-sm rounded-lg border-0 bg-white px-3 py-2 text-slate-900 outline-none"
          />
        </div>
      </div>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <MensagemDeErro erro={produtos.erro} />
        {produtos.carregando && !produtos.dados && <Carregando />}
        {produtos.erro && (
          <Vazio titulo="Loja fora do ar">
            A API da loja não respondeu em {URLS_DAS_FARMACIAS[loja]}. Suba o serviço <code>farmacia-{loja}</code>.
          </Vazio>
        )}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {visiveis.map((produto) => (
            <button
              key={produto.id}
              onClick={() => navegar(`/${loja}/produto/${produto.codigo}`)}
              className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-sm transition hover:shadow-md"
            >
              <Imagem produto={produto} className="h-44 w-full" />
              <div className="flex flex-1 flex-col p-4">
                <p className="line-clamp-1 font-semibold text-slate-900">{produto.nomeComercial}</p>
                <p className="line-clamp-2 h-8 text-xs text-slate-500">
                  {produto.concentracao} · {produto.apresentacao}
                </p>
                <p className="mt-1 text-[11px] text-slate-400">{produto.tarja}</p>
                <div className="mt-auto flex items-end justify-between pt-3">
                  <p className={`text-xl font-bold ${tema.texto}`}>{formatarPreco(produto.precoCentavos)}</p>
                  <span className={`rounded-md px-2 py-1 text-xs text-white ${tema.botao}`}>Detalhes</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </main>
    </>
  );
}

function PaginaDoProduto({ loja, codigo, navegar }: { loja: IdDaFarmacia; codigo: string; navegar: (caminho: string) => void }) {
  const tema = temaDa(loja);
  const produtos = useConsulta(() => apiDaFarmacia(loja).listarProdutos(), [loja], INTERVALO_DE_ATUALIZACAO_MS);
  const produto = produtos.dados?.find((item) => item.codigo === codigo);
  const farmacia = FARMACIAS.find((item) => item.id === loja)!;

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <p className="mb-4 text-sm text-slate-500">
        <button className="underline" onClick={() => navegar(`/${loja}`)}>
          {farmacia.nome}
        </button>{" "}
        › {produto?.categoria ?? "Produto"} › {produto?.nomeComercial ?? codigo}
      </p>
      <MensagemDeErro erro={produtos.erro} />
      {!produto && !produtos.carregando && <Vazio titulo="Produto não encontrado nesta loja">Ele pode ter sido removido na gestão das lojas.</Vazio>}
      {produto && (
        <div className="grid gap-6 md:grid-cols-2">
          <Imagem produto={produto} className="h-80 w-full rounded-xl" />
          <div>
            <p className="text-xs text-slate-500 uppercase">{produto.tarja}</p>
            <h1 className="text-2xl font-semibold text-slate-900">{produto.nomeComercial}</h1>
            <p className="text-slate-600">
              {produto.principioAtivo} {produto.concentracao} · {produto.apresentacao}
            </p>
            <p className={`mt-4 text-4xl font-bold ${tema.texto}`}>{formatarPreco(produto.precoCentavos)}</p>
            <p className="text-xs text-slate-400">preço atualizado {tempoRelativo(produto.atualizadoEm)}</p>
            <dl className="mt-5 grid grid-cols-2 gap-2 text-sm">
              <dt className="text-slate-500">Código</dt>
              <dd className="font-mono">{produto.codigo}</dd>
              <dt className="text-slate-500">Fabricante</dt>
              <dd>{produto.fabricante}</dd>
              <dt className="text-slate-500">Registro MS</dt>
              <dd>{produto.registroMs ?? "não informado"}</dd>
              <dt className="text-slate-500">Forma</dt>
              <dd>{produto.formaFarmaceutica}</dd>
            </dl>
            {produto.descricao && <p className="mt-5 text-sm text-slate-600">{produto.descricao}</p>}
          </div>
        </div>
      )}
    </main>
  );
}

export function App() {
  const [partes, navegar] = useCaminho();
  const loja = FARMACIAS.find((item) => item.id === partes[0])?.id;

  return (
    <div className="min-h-screen">
      <BarraDeNavegacao atual="vitrines" />
      {!loja && (
        <main className="mx-auto max-w-5xl px-4 py-10">
          <h1 className="text-2xl font-semibold text-slate-900">Farmácias simuladas</h1>
          <p className="mt-1 text-sm text-slate-500">Sistemas externos usados para validar o PriceHub. Cada uma tem identidade e perfil de preço próprios.</p>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {FARMACIAS.map((farmacia) => {
              const tema = temaDa(farmacia.id);
              return (
                <button key={farmacia.id} onClick={() => navegar(`/${farmacia.id}`)} className="overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-sm hover:shadow-md">
                  <div className={`${tema.cabecalho} px-5 py-6 text-white`}>
                    <p className="text-lg font-bold">{farmacia.nome}</p>
                    <p className="text-sm opacity-80">{SLOGANS[farmacia.id]}</p>
                  </div>
                  <p className="px-5 py-3 text-sm text-slate-600">perfil de preço: {farmacia.perfil}</p>
                </button>
              );
            })}
          </div>
        </main>
      )}
      {loja && partes[1] === "produto" && partes[2] && <PaginaDoProduto loja={loja} codigo={decodeURIComponent(partes[2])} navegar={navegar} />}
      {loja && partes[1] !== "produto" && <Vitrine loja={loja} navegar={navegar} />}
    </div>
  );
}
