import { useState } from "react";

import { Abas, BarraDeNavegacao } from "@pricehub/ui";

import { Apis } from "./Apis";
import { Comparativo } from "./Comparativo";
import { EventosAoVivo } from "./EventosAoVivo";
import { FilasEServicos } from "./FilasEServicos";

type Aba = "eventos" | "filas" | "comparativo" | "apis";

const ABAS: { id: Aba; rotulo: string }[] = [
  { id: "eventos", rotulo: "Eventos ao vivo" },
  { id: "filas", rotulo: "Filas e serviços" },
  { id: "comparativo", rotulo: "Microsserviços x monólito" },
  { id: "apis", rotulo: "Documentação das APIs" },
];

export function App() {
  const parametros = new URLSearchParams(window.location.search);
  const [aba, setAba] = useState<Aba>((parametros.get("aba") as Aba) ?? "eventos");

  return (
    <div className="min-h-screen">
      <BarraDeNavegacao atual="monitor" />
      <main className="mx-auto max-w-7xl px-4 py-6">
        <h1 className="text-2xl font-semibold text-slate-900">Monitor de eventos</h1>
        <p className="mt-1 mb-5 max-w-3xl text-sm text-slate-500">
          O que acontece por dentro do PriceHub: cada evento publicado no RabbitMQ, o caminho de uma alteração entre os microsserviços, as
          filas e o efeito medido da comunicação assíncrona.
        </p>
        <Abas abas={ABAS} atual={aba} aoTrocar={setAba} />
        {aba === "eventos" && <EventosAoVivo correlationIdInicial={parametros.get("correlationId") ?? undefined} />}
        {aba === "filas" && <FilasEServicos />}
        {aba === "comparativo" && <Comparativo />}
        {aba === "apis" && <Apis />}
      </main>
    </div>
  );
}
