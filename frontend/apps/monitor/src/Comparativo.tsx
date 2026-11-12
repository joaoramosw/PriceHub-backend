import { apiDoLog, useConsulta, type Distribuicao } from "@pricehub/api";
import { Cartao, MensagemDeErro, TituloDeSecao, Vazio, formatarHora, formatarMs, temaDa } from "@pricehub/ui";

const INTERVALO_MS = 3000;

function Indicador({ titulo, descricao, distribuicao, destaque }: { titulo: string; descricao: string; distribuicao: Distribuicao; destaque: string }) {
  return (
    <div className={`rounded-xl border p-4 ${destaque}`}>
      <p className="text-sm font-medium text-slate-700">{titulo}</p>
      <p className="mt-1 text-3xl font-bold text-slate-900">{formatarMs(distribuicao.medianaMs)}</p>
      <p className="text-xs text-slate-500">
        mediana · média {formatarMs(distribuicao.mediaMs)} · p95 {formatarMs(distribuicao.p95Ms)} · {distribuicao.amostras} amostras
      </p>
      <p className="mt-2 text-xs text-slate-600">{descricao}</p>
    </div>
  );
}

const DIFERENCAS = [
  {
    aspecto: "Quem produz o dado (farmácia) espera",
    sincrono: "A cadeia inteira: ingestão + catálogo + banco. Latência somada.",
    eventos: "Só a ingestão publicar o evento (tempo de aceite).",
  },
  {
    aspecto: "Catálogo fora do ar",
    sincrono: "A atualização falha e o erro volta para a farmácia.",
    eventos: "O evento fica na fila e é processado quando o catálogo voltar.",
  },
  {
    aspecto: "Pico de atualizações",
    sincrono: "N requisições viram N chamadas em cascata; risco de efeito dominó.",
    eventos: "A fila amortece o pico; cada consumidor processa no seu ritmo.",
  },
  {
    aspecto: "Escalar",
    sincrono: "Replica-se a aplicação inteira.",
    eventos: "Replica-se só o consumidor que acumula fila (ex.: ms-catalogo).",
  },
  {
    aspecto: "Incluir uma nova reação (ex.: alertas)",
    sincrono: "Altera-se o fluxo central para chamar o novo módulo.",
    eventos: "Novo serviço assina o evento; nenhum produtor muda (como o ms-log).",
  },
  {
    aspecto: "Custo",
    sincrono: "Menos peças: um processo, um banco, depuração simples.",
    eventos: "Broker, vários bancos, consistência eventual, idempotência, outbox e logs correlacionados.",
  },
];

export function Comparativo() {
  const metricas = useConsulta(() => apiDoLog.metricas(), [], INTERVALO_MS);
  const dados = metricas.dados;

  return (
    <div className="space-y-6">
      <Cartao>
        <TituloDeSecao
          titulo="O ganho medido da comunicação assíncrona"
          subtitulo="Calculado pelo ms-log a partir dos eventos reais desta execução. Altere preços nas lojas para gerar amostras."
        />
        <MensagemDeErro erro={metricas.erro} />
        {dados && dados.convergencia.amostras === 0 && <Vazio titulo="Sem amostras ainda">Altere um preço em uma farmácia para medir a propagação.</Vazio>}
        {dados && dados.convergencia.amostras > 0 && (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <Indicador
                titulo="Tempo de aceite"
                descricao="Quanto a farmácia esperou: o ms-ingestao responde assim que publica no RabbitMQ."
                distribuicao={dados.aceite}
                destaque="border-emerald-200 bg-emerald-50"
              />
              <Indicador
                titulo="Janela de convergência"
                descricao="Do primeiro evento até o catálogo atualizado (consistência eventual)."
                distribuicao={dados.convergencia}
                destaque="border-indigo-200 bg-indigo-50"
              />
              <Indicador
                titulo="Espera equivalente se fosse síncrono"
                descricao="Aceite + convergência: o que a farmácia esperaria em uma cadeia HTTP ou monólito."
                distribuicao={dados.equivalenteSincrono}
                destaque="border-amber-200 bg-amber-50"
              />
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Com o consumo do ms-catalogo pausado (aba "Filas e serviços"), a convergência cresce, mas o aceite continua baixo: o produtor não
              sente a indisponibilidade do consumidor.
            </p>

            <h3 className="mt-6 mb-2 text-sm font-semibold text-slate-700">Últimas propagações</h3>
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-xs text-slate-500 uppercase">
                <tr>
                  <th className="py-2">Quando</th>
                  <th className="py-2">Farmácia</th>
                  <th className="py-2">Origem</th>
                  <th className="py-2 text-right">Ofertas</th>
                  <th className="py-2 text-right">Aceite</th>
                  <th className="py-2 text-right">Convergência</th>
                </tr>
              </thead>
              <tbody>
                {dados.ultimasPropagacoes.map((amostra) => (
                  <tr key={amostra.correlationId} className="border-b border-slate-100">
                    <td className="py-1.5 font-mono text-xs">{formatarHora(amostra.ocorridoEm)}</td>
                    <td className={`py-1.5 text-xs ${temaDa(amostra.farmaciaId).texto}`}>{amostra.farmaciaId}</td>
                    <td className="py-1.5 text-xs">{amostra.origem}</td>
                    <td className="py-1.5 text-right font-mono text-xs">{amostra.ofertasAtualizadas}</td>
                    <td className="py-1.5 text-right font-mono text-xs">{formatarMs(amostra.aceiteMs)}</td>
                    <td className="py-1.5 text-right font-mono text-xs">{formatarMs(amostra.convergenciaMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Cartao>

      <Cartao>
        <TituloDeSecao titulo="Monólito síncrono x microsserviços orientados a eventos" subtitulo="Vantagens e custos, sem esconder o lado ruim." />
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-xs text-slate-500 uppercase">
            <tr>
              <th className="py-2 pr-3">Aspecto</th>
              <th className="py-2 pr-3">Monólito / cadeia síncrona</th>
              <th className="py-2">PriceHub (eventos + RabbitMQ)</th>
            </tr>
          </thead>
          <tbody>
            {DIFERENCAS.map((linha) => (
              <tr key={linha.aspecto} className="border-b border-slate-100 align-top">
                <td className="py-2 pr-3 font-medium text-slate-800">{linha.aspecto}</td>
                <td className="py-2 pr-3 text-slate-600">{linha.sincrono}</td>
                <td className="py-2 text-slate-600">{linha.eventos}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {dados && (
          <p className="mt-4 text-xs text-slate-500">
            Eventos registrados: {dados.totalDeEventos} · por serviço:{" "}
            {Object.entries(dados.porServico)
              .map(([servico, total]) => `${servico} ${total}`)
              .join(" · ")}
          </p>
        )}
      </Cartao>
    </div>
  );
}
