import { apiDaIngestao, FARMACIAS, urlDaLoja, urlDoAdminDaLoja, useConsulta } from "@pricehub/api";
import { Cartao, MensagemDeErro, Selo, tempoRelativo, temaDa } from "@pricehub/ui";

const EXPLICACAO_DA_INTEGRACAO = {
  webhook: "A loja avisa o PriceHub a cada alteração de preço (webhook assinado com HMAC).",
  polling: "O PriceHub consulta o arquivo de preços da loja periodicamente e só baixa de novo quando o ETag muda.",
};

export function PaginaDasParceiras({ versao }: { versao: number }) {
  const integracoes = useConsulta(() => apiDaIngestao.farmacias(), [versao]);
  const porFarmacia = new Map((integracoes.dados ?? []).map((estado) => [estado.farmaciaId, estado]));

  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <h1 className="text-2xl font-semibold text-slate-900">Farmácias parceiras</h1>
      <p className="mt-1 mb-6 max-w-3xl text-sm text-slate-600">
        Cada farmácia é um sistema separado, com site, formato de dados e forma de integração próprios. Na administração da loja dá para alterar
        um preço à mão ou acompanhar os reajustes automáticos; o PriceHub recebe a mudança por eventos.
      </p>
      <MensagemDeErro erro={integracoes.erro} />

      <div className="grid gap-4 lg:grid-cols-3">
        {FARMACIAS.map((farmacia) => {
          const estado = porFarmacia.get(farmacia.id);
          const tema = temaDa(farmacia.id);
          return (
            <Cartao key={farmacia.id} className="flex flex-col">
              <div className="flex items-start justify-between gap-3">
                <h2 className={`flex items-center gap-2 text-lg font-semibold ${tema.texto}`}>
                  <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${tema.ponto}`} />
                  {farmacia.nome}
                </h2>
                {estado && (
                  <Selo tom={estado.situacao === "disponivel" ? "sucesso" : estado.situacao === "indisponivel" ? "perigo" : "neutro"}>
                    {estado.situacao === "disponivel" ? "no ar" : estado.situacao === "indisponivel" ? "fora do ar" : "aguardando"}
                  </Selo>
                )}
              </div>

              <dl className="mt-3 space-y-2 text-sm">
                <div>
                  <dt className="text-slate-600">Integração</dt>
                  <dd className="text-slate-900">
                    {farmacia.integracao}: {EXPLICACAO_DA_INTEGRACAO[farmacia.integracao]}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-600">Formato dos dados</dt>
                  <dd className="text-slate-900">{farmacia.formato}</dd>
                </div>
                {estado && (
                  <div>
                    <dt className="text-slate-600">Última coleta</dt>
                    <dd className="text-slate-900 tabular-nums">
                      {estado.ultimaColetaEm ? tempoRelativo(estado.ultimaColetaEm) : "nenhuma ainda"} · {estado.coletasRealizadas} coletas
                      {estado.ultimoErro && <span className="block text-red-700">{estado.ultimoErro}</span>}
                    </dd>
                  </div>
                )}
              </dl>

              <div className="mt-auto flex flex-wrap gap-2 pt-4">
                <a
                  href={urlDaLoja(farmacia.id)}
                  target="_blank"
                  rel="noreferrer"
                  className={`inline-flex min-h-10 items-center rounded-md px-3 text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${tema.botao}`}
                >
                  Abrir o site da loja
                </a>
                <a
                  href={urlDoAdminDaLoja(farmacia.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-10 items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                >
                  Administração (preços)
                </a>
              </div>
              <p className="mt-2 font-mono text-xs text-slate-600">{urlDaLoja(farmacia.id)}</p>
            </Cartao>
          );
        })}
      </div>
    </main>
  );
}
