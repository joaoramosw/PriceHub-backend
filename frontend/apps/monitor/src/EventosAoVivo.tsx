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

const pertenceAFamilia = (tipo: string, prefixo: string) => tipo.startsWith(prefixo);

function resumoDosDados(registro: RegistroDeEvento): string {
  const dados = registro.dados as Record<string, any>;
  if (registro.tipo === "catalogo.oferta.atualizada") {
    const de = dados.precoAnteriorCentavos != null ? (dados.precoAnteriorCentavos / 100).toFixed(2) : "--";
    const origem = dados.origemDaAlteracao ? ` · ${dados.origemDaAlteracao}` : "";
    return `${dados.medicamentoNome} · ${dados.situacao}${origem} · R$ ${de} → R$ ${(dados.precoAtualCentavos / 100).toFixed(2)}`;
  }
  if (registro.tipo === "catalogo.menor-preco.alterado")
    return `${dados.medicamentoNome} · ${dados.farmaciaAnteriorNome} → ${dados.farmaciaAtualNome} · R$ ${(dados.precoAtualCentavos / 100).toFixed(2)}`;
  if (registro.tipo === "ingestao.oferta.recebida")
    return `${dados.oferta?.codigoExterno} · R$ ${(dados.oferta?.precoCentavos / 100).toFixed(2)} · via ${dados.origem}`;
  if (registro.tipo === "ingestao.coleta.realizada")
    return `${dados.origem} · ${dados.ofertasPublicadas} publicadas, ${dados.ofertasSemAlteracao} sem alteração · aceite ${dados.duracaoMs} ms`;
  if (registro.tipo === "catalogo.medicamento.cadastrado") return `${dados.nome} (${dados.apresentacao})`;
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
    .filter((registro) => pertenceAFamilia(registro.tipo, familia))
    .filter((registro) => !farmacia || registro.farmaciaId === farmacia);

  const limparLog = async () => {
    if (!window.confirm("Apagar todos os registros do ms-log? (útil para começar a demonstração do zero)")) return;
    await apiDoLog.limpar();
    setNovos([]);
    iniciais.recarregar();
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
      <Cartao>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {FAMILIAS.map((item) => (
            <Botao
              key={item.prefixo}
              variante={familia === item.prefixo ? "primario" : "secundario"}
              onClick={() => setFamilia(item.prefixo)}
            >
              {item.rotulo}
            </Botao>
          ))}
          <select
            value={farmacia}
            onChange={(evento) => setFarmacia(evento.target.value)}
            aria-label="Filtrar por farmácia"
            className="min-h-10 rounded-md border border-slate-300 bg-white px-2 text-sm"
          >
            <option value="">Todas as farmácias</option>
            {FARMACIAS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nome}
              </option>
            ))}
          </select>
          <div className="ml-auto flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <IndicadorDeConexao situacao={congelado ? "desconectado" : conexao} rotulo="ms-log" />
            <Botao variante="secundario" onClick={() => setCongelado(!congelado)}>
              {congelado ? "Retomar" : "Congelar"}
            </Botao>
            <Botao variante="secundario" onClick={() => baixarComoJson(registros)}>
              Exportar JSON
            </Botao>
            <Botao variante="fantasma" className="text-red-700" onClick={limparLog}>
              Limpar log
            </Botao>
          </div>
        </div>
        <MensagemDeErro erro={iniciais.erro} />
        {registros.length === 0 && !iniciais.carregando && (
          <Vazio titulo="Nenhum evento registrado">
            Quando uma farmácia subir ou um preço mudar, os eventos aparecem aqui em tempo real.
          </Vazio>
        )}
        <ul className="max-h-[70vh] divide-y divide-slate-100 overflow-y-auto">
          {registros.map((registro) => (
            <li key={registro.idDoEvento}>
              <button
                onClick={() => setSelecionado(registro.correlationId)}
                className={`flex w-full items-start gap-3 px-2 py-2 text-left text-sm hover:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-slate-900 ${
                  selecionado === registro.correlationId ? "bg-amber-50" : ""
                }`}
              >
                <span className="w-24 shrink-0 font-mono text-xs text-slate-500">{formatarHora(registro.ocorridoEm)}</span>
                <span className={`shrink-0 rounded border px-1.5 py-0.5 text-xs font-medium ${corDoEvento(registro.tipo)}`}>
                  {registro.tipo}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-slate-700">{resumoDosDados(registro)}</span>
                  <span className="flex gap-2 text-xs text-slate-500">
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
  );
}
