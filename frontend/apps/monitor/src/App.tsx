import { useEffect, useState } from "react";

import { Abas, BarraDeNavegacao } from "@pricehub/ui";

import { EventosAoVivo } from "./EventosAoVivo";
import { FilasEServicos } from "./FilasEServicos";
import { Metricas } from "./Metricas";

type Aba = "eventos" | "filas" | "metricas";

const ABAS: { id: Aba; rotulo: string }[] = [
  { id: "eventos", rotulo: "Eventos" },
  { id: "filas", rotulo: "Filas e serviços" },
  { id: "metricas", rotulo: "Métricas" },
];

/** A aba vem do caminho (/monitor/filas); ?aba= continua aceito para links antigos. */
function abaDaUrl(): Aba {
  const doCaminho = window.location.pathname.replace(/^\/monitor\/?/, "").split("/")[0];
  const pedida = doCaminho || new URLSearchParams(window.location.search).get("aba") || "eventos";
  return ABAS.some((aba) => aba.id === pedida) ? (pedida as Aba) : "eventos";
}

export function App() {
  const [aba, setAba] = useState<Aba>(abaDaUrl);
  const correlationId = new URLSearchParams(window.location.search).get("correlationId") ?? undefined;

  useEffect(() => {
    const aoVoltar = () => setAba(abaDaUrl());
    window.addEventListener("popstate", aoVoltar);
    return () => window.removeEventListener("popstate", aoVoltar);
  }, []);

  const trocarDeAba = (nova: Aba) => {
    window.history.pushState(null, "", `/monitor/${nova}`);
    setAba(nova);
  };

  return (
    <div className="min-h-screen">
      <BarraDeNavegacao atual="monitor" />
      <main className="mx-auto max-w-7xl px-4 py-6">
        <h1 className="text-2xl font-semibold text-slate-900">Monitor de eventos</h1>
        <p className="mt-1 mb-5 max-w-3xl text-sm text-slate-600">
          O que acontece por dentro do PriceHub: cada evento publicado no RabbitMQ, as filas, a saúde de cada serviço e os tempos medidos
          entre a alteração na farmácia e o preço no comparador.
        </p>
        <Abas abas={ABAS} atual={aba} aoTrocar={trocarDeAba} />
        {aba === "eventos" && <EventosAoVivo correlationIdInicial={correlationId} />}
        {aba === "filas" && <FilasEServicos />}
        {aba === "metricas" && <Metricas />}
      </main>
    </div>
  );
}
