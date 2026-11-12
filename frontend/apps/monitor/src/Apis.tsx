import { apiDoLog, URLS_DAS_FARMACIAS, URLS_DOS_SERVICOS, useConsulta } from "@pricehub/api";
import { Cartao, Selo, TituloDeSecao } from "@pricehub/ui";

const DESCRICOES: Record<string, string> = {
  "ms-ingestao": "Webhooks, polling, padrão Adapter e publicação dos eventos de ingestão.",
  "ms-catalogo": "Catálogo padronizado, comparação de preços, histórico, outbox e SSE.",
  "ms-consulta": "Projeções CQRS de leitura, reconstruídas a partir dos eventos do catálogo.",
  "ms-bff": "Entrada HTTP do front-end: encaminha cada rota ao serviço responsável.",
  "ms-log": "Serviço de log: todos os eventos, rastreamento, métricas, filas e saúde.",
  "farmacia-biofarma": "Farmácia simulada (webhook, camelCase, preço em reais).",
  "farmacia-farmaazul": "Farmácia simulada (webhook, paginada, snake_case, centavos).",
  "farmacia-drogapopular": "Farmácia simulada legada (polling com ETag, texto em maiúsculas).",
};

const PADRAO = {
  "ms-ingestao": URLS_DOS_SERVICOS.ingestao,
  "ms-catalogo": URLS_DOS_SERVICOS.catalogo,
  "ms-log": URLS_DOS_SERVICOS.log,
  "ms-consulta": URLS_DOS_SERVICOS.consulta,
  "ms-bff": "http://localhost:8000",
  "farmacia-biofarma": URLS_DAS_FARMACIAS.biofarma,
  "farmacia-farmaazul": URLS_DAS_FARMACIAS.farmaazul,
  "farmacia-drogapopular": URLS_DAS_FARMACIAS.drogapopular,
};

export function Apis() {
  const servicos = useConsulta(() => apiDoLog.servicos(), []);
  const situacao = new Map((servicos.dados ?? []).map((servico) => [servico.nome, servico.status]));

  return (
    <Cartao>
      <TituloDeSecao
        titulo="Documentação interativa das APIs"
        subtitulo="Cada microsserviço publica a sua especificação OpenAPI. No Swagger dá para ver as rotas, os validadores e testar GET, POST, PUT, PATCH e DELETE."
      />
      <div className="grid gap-3 md:grid-cols-2">
        {Object.entries(PADRAO).map(([nome, url]) => (
          <div key={nome} className="rounded-lg border border-slate-200 p-4">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-slate-900">{nome}</p>
              {situacao.has(nome) && <Selo tom={situacao.get(nome) === "ok" ? "sucesso" : "perigo"}>{situacao.get(nome)}</Selo>}
            </div>
            <p className="mt-1 text-sm text-slate-500">{DESCRICOES[nome]}</p>
            <div className="mt-3 flex flex-wrap gap-3 text-sm">
              <a className="font-medium text-slate-900 underline" href={`${url}/docs`} target="_blank" rel="noreferrer">
                Swagger UI
              </a>
              <a className="text-slate-600 underline" href={`${url}/redoc`} target="_blank" rel="noreferrer">
                ReDoc
              </a>
              <a className="text-slate-600 underline" href={`${url}/openapi.json`} target="_blank" rel="noreferrer">
                openapi.json
              </a>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-slate-500">
        RabbitMQ: painel de gerenciamento em <code>http://localhost:15672</code> (usuário e senha definidos no <code>.env</code>).
      </p>
    </Cartao>
  );
}
