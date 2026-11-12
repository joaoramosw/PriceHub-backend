import { useState } from "react";

import { apiDoLog, FARMACIAS, useConsulta, useFluxoDeEventos, type RegistroDeEvento } from "@pricehub/api";
import { Botao, Cartao, IndicadorDeConexao, MensagemDeErro, Vazio, corDoEvento, formatarHora, temaDa } from "@pricehub/ui";

import { LinhaDoTempo } from "./LinhaDoTempo";

const LIMITE_NA_TELA = 300;
const FAMILIAS = [
  { prefixo: "", rotulo: "Todos" },
  { prefixo: "ingestao.", rotulo: "Ingestão" },
  { prefixo: "catalogo.", rotulo: "Catálogo" },
];

function resumoDosDados(registro: RegistroDeEvento): string {
  const dados = registro.dados as Record<string, any>;
  if (registro.tipo === "catalogo.oferta.atualizada") {
    const de = dados.precoAnteriorCentavos != null ? (dados.precoAnteriorCentavos / 100).toFixed(2) : "--";
    return `${dados.medicamentoNome} · ${dados.situacao} · R$ ${de} → R$ ${(dados.precoAtualCentavos / 100).toFixed(2)}`;
  }
  if (registro.tipo === "ingestao.oferta.recebida") return `${dados.oferta?.codigoExterno} · R$ ${(dados.oferta?.precoCentavos / 100).toFixed(2)} · via ${dados.origem}`;
  if (registro.tipo === "ingestao.coleta.realizada")
    return `${dados.origem} · ${dados.ofertasPublicadas} publicadas, ${dados.ofertasSemAlteracao} sem alteração · aceite ${dados.duracaoMs} ms`;
  if (registro.tipo === "catalogo.medicamento.cadastrado") return `${dados.nome} (${dados.apresentacao})`;
  if (registro.tipo === "catalogo.visao.atualizada") return `${dados.medicamentoNome} · projeção de leitura atualizada`;
  return dados.motivo ?? dados.codigoExterno ?? "";
}

function baixarComoJson(registros: RegistroDeEvento[]) {
  const arquivo = new Blob([JSON.stringify(registros, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(arquivo);
  link.download = `eventos-pricehub-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function EventosAoVivo({ correlationIdInicial }: { correlationIdInicial?: string }) {
  const [novos, setNovos] = useState<RegistroDeEvento[]>([]);
  const [familia, setFamilia] = useState("");
  const [farmacia, setFarmacia] = useState("");
  const [congelado, setCongelado] = useState(false);
  const [selecionado, setSelecionado] = useState<string | undefined>(correlationIdInicial);
  const iniciais = useConsulta(() => apiDoLog.registros({ limite: 150 }), []);

  const conexao = useFluxoDeEventos<RegistroDeEvento>(
    apiDoLog.urlDoTempoReal,
    (_tipo, registro) => setNovos((atuais) => [registro, ...atuais].slice(0, LIMITE_NA_TELA)),
    !congelado,
  );

  const vistos = new Set<string>();
  const registros = [...novos, ...(iniciais.dados ?? [])]
    .filter((registro) => !vistos.has(registro.idDoEvento) && Boolean(vistos.add(registro.idDoEvento)))
    .filter((registro) => registro.tipo.startsWith(familia))
    .filter((registro) => !farmacia || registro.farmaciaId === farmacia);

  const limparLog = async () => {
    if (!window.confirm("Apagar todos os registros do ms-log? (útil para começar a demonstração do zero)")) return;
    await apiDoLog.limpar();
    setNovos([]);
    iniciais.recarregar();
  };

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white px-4 py-3" aria-label="Caminho de uma alteração de preço">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Caminho de uma alteração</p>
        <p className="mt-2 text-sm leading-6 text-slate-700">
          Gestão → <strong>BFF</strong> → farmácia → webhook ou polling → <strong>ms-ingestao</strong> → RabbitMQ → <strong>ms-catalogo</strong>
          → outbox e RabbitMQ → <strong>ms-consulta</strong> → comparador. O ms-log registra os eventos com o mesmo correlationId.
        </p>
        <p className="mt-1 text-xs text-slate-500">A resposta de aceite chega primeiro; a projeção de leitura converge quando os consumidores processam os eventos.</p>
      </section>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
      <Cartao>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {FAMILIAS.map((item) => (
            <Botao key={item.prefixo} variante={familia === item.prefixo ? "primario" : "secundario"} onClick={() => setFamilia(item.prefixo)}>
              {item.rotulo}
            </Botao>
          ))}
          <select value={farmacia} onChange={(evento) => setFarmacia(evento.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
            <option value="">Todas as farmácias</option>
            {FARMACIAS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nome}
              </option>
            ))}
          </select>
          <div className="ml-auto flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <IndicadorDeConexao situacao={congelado ? "desconectado" : conexao} rotulo="ms-log" />
            <Botao variante="secundario" onClick={() => setCongelado(!congelado)}>
              {congelado ? "Retomar" : "Congelar"}
            </Botao>
            <Botao variante="secundario" onClick={() => baixarComoJson(registros)}>
              Exportar JSON
            </Botao>
            <Botao variante="fantasma" className="text-red-600" onClick={limparLog}>
              Limpar log
            </Botao>
          </div>
        </div>
        <MensagemDeErro erro={iniciais.erro} />
        {registros.length === 0 && !iniciais.carregando && (
          <Vazio titulo="Nenhum evento registrado">Quando uma farmácia subir ou um preço mudar, os eventos aparecem aqui em tempo real.</Vazio>
        )}
        <ul className="max-h-[70vh] divide-y divide-slate-100 overflow-y-auto">
          {registros.map((registro) => (
            <li key={registro.idDoEvento}>
              <button
                onClick={() => setSelecionado(registro.correlationId)}
                className={`flex w-full items-start gap-3 px-2 py-2 text-left text-sm hover:bg-slate-50 ${
                  selecionado === registro.correlationId ? "bg-amber-50" : ""
                }`}
              >
                <span className="w-24 shrink-0 font-mono text-[11px] text-slate-400">{formatarHora(registro.ocorridoEm)}</span>
                <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[11px] font-medium ${corDoEvento(registro.tipo)}`}>{registro.tipo}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-slate-700">{resumoDosDados(registro)}</span>
                  <span className="flex gap-2 text-[11px] text-slate-400">
                    <span>{registro.servicoDeOrigem}</span>
                    {registro.farmaciaId && <span className={temaDa(registro.farmaciaId).texto}>{registro.farmaciaId}</span>}
                    <span className="truncate">corr. {registro.correlationId.slice(0, 8)}</span>
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Cartao>
      <LinhaDoTempo correlationId={selecionado} versao={novos.length} />
      </div>
    </div>
  );
}
