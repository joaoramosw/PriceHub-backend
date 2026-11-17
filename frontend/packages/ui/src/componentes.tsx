import { useCallback, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";

import { URLS_DOS_APPS } from "@pricehub/api";

type App = keyof typeof URLS_DOS_APPS;

const ITENS_DE_NAVEGACAO: { app: App; rotulo: string; descricao: string }[] = [
  { app: "comparador", rotulo: "Comparar preços", descricao: "Os três preços de cada medicamento" },
  { app: "parceiras", rotulo: "Farmácias parceiras", descricao: "Sites e telas de administração das lojas" },
  { app: "monitor", rotulo: "Monitor de eventos", descricao: "Logs, filas e métricas" },
];

/** Barra comum aos micro-frontends. O monitor é outra aplicação, servida pelo gateway em /monitor/. */
export function BarraDeNavegacao({ atual, extra }: { atual: App; extra?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <a href={URLS_DOS_APPS.comparador} className="flex items-center gap-2 font-semibold text-slate-900">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-900 text-sm text-white">P+</span>
          PriceHub
        </a>
        <nav className="flex flex-wrap gap-1 text-sm">
          {ITENS_DE_NAVEGACAO.map((item) => (
            <a
              key={item.app}
              href={URLS_DOS_APPS[item.app]}
              title={item.descricao}
              aria-current={item.app === atual ? "page" : undefined}
              className={
                item.app === atual
                  ? "inline-flex min-h-10 items-center rounded-md bg-slate-900 px-3 font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                  : "inline-flex min-h-10 items-center rounded-md px-3 text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
              }
            >
              {item.rotulo}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-xs text-slate-500">
          {extra}
          <span className="hidden rounded border border-dashed border-slate-300 px-2 py-0.5 md:inline">micro-frontend: {atual}</span>
        </div>
      </div>
    </header>
  );
}

export function Cartao({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-lg border border-slate-200 bg-white p-5 ${className}`}>{children}</section>;
}

export function TituloDeSecao({ titulo, subtitulo, acoes }: { titulo: string; subtitulo?: ReactNode; acoes?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">{titulo}</h2>
        {subtitulo && <p className="mt-0.5 text-sm text-slate-500">{subtitulo}</p>}
      </div>
      {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
    </div>
  );
}

type VarianteDoBotao = "primario" | "secundario" | "perigo" | "fantasma";

const CLASSES_DO_BOTAO: Record<VarianteDoBotao, string> = {
  primario: "bg-slate-900 text-white hover:bg-slate-700",
  secundario: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
  perigo: "bg-red-600 text-white hover:bg-red-700",
  fantasma: "text-slate-600 hover:bg-slate-100",
};

export function Botao({ variante = "primario", className = "", ...propriedades }: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: VarianteDoBotao }) {
  return (
    <button
      {...propriedades}
      className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:cursor-not-allowed disabled:opacity-50 ${CLASSES_DO_BOTAO[variante]} ${className}`}
    />
  );
}

type TomDoSelo = "neutro" | "sucesso" | "alerta" | "perigo" | "info";

const CLASSES_DO_SELO: Record<TomDoSelo, string> = {
  neutro: "bg-slate-100 text-slate-700",
  sucesso: "bg-emerald-100 text-emerald-800",
  alerta: "bg-amber-100 text-amber-800",
  perigo: "bg-red-100 text-red-800",
  info: "bg-sky-100 text-sky-900",
};

export function Selo({ tom = "neutro", children }: { tom?: TomDoSelo; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${CLASSES_DO_SELO[tom]}`}>{children}</span>;
}

export function Vazio({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
      <p className="font-medium text-slate-700">{titulo}</p>
      {children && <div className="mx-auto mt-2 max-w-xl text-sm text-slate-500">{children}</div>}
    </div>
  );
}

export function Carregando({ texto = "Carregando..." }: { texto?: string }) {
  return (
    <p role="status" className="py-6 text-center text-sm text-slate-600">
      {texto}
    </p>
  );
}

export function MensagemDeErro({ erro }: { erro: Error | undefined }) {
  if (!erro) return null;
  return (
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      {erro.message}
    </div>
  );
}

export function Campo({
  rotulo,
  erro,
  ajuda,
  ...propriedades
}: InputHTMLAttributes<HTMLInputElement> & { rotulo: string; erro?: string; ajuda?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{rotulo}</span>
      <input
        {...propriedades}
        className={`w-full rounded-lg border px-3 py-2 outline-none focus:ring-2 ${
          erro ? "border-red-400 focus:ring-red-200" : "border-slate-300 focus:ring-slate-200"
        }`}
      />
      {erro ? <span className="mt-1 block text-xs text-red-600">{erro}</span> : ajuda && <span className="mt-1 block text-xs text-slate-500">{ajuda}</span>}
    </label>
  );
}

export function IndicadorDeConexao({ situacao, rotulo = "tempo real" }: { situacao: "conectando" | "conectado" | "desconectado"; rotulo?: string }) {
  const cor = situacao === "conectado" ? "bg-emerald-500" : situacao === "conectando" ? "bg-amber-400" : "bg-red-500";
  return (
    <span className="inline-flex items-center gap-1.5" title={`Conexão SSE: ${situacao}`}>
      <span aria-hidden className={`h-2 w-2 rounded-full ${cor}`} />
      {rotulo}: {situacao}
    </span>
  );
}

export interface Aviso {
  id: number;
  titulo: string;
  texto?: string;
  tom: "sucesso" | "info" | "alerta" | "perigo";
}

/** Notificações temporárias (ex.: "preço atualizado" ao chegar um evento). */
export function useAvisos(duracaoMs = 6000) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const avisar = useCallback(
    (aviso: Omit<Aviso, "id">) => {
      const id = Date.now() + Math.random();
      setAvisos((atuais) => [{ ...aviso, id }, ...atuais].slice(0, 5));
      window.setTimeout(() => setAvisos((atuais) => atuais.filter((item) => item.id !== id)), duracaoMs);
    },
    [duracaoMs],
  );
  return { avisos, avisar };
}

const CLASSES_DO_AVISO: Record<Aviso["tom"], string> = {
  sucesso: "border-emerald-300 bg-emerald-50",
  info: "border-sky-300 bg-sky-50",
  alerta: "border-amber-300 bg-amber-50",
  perigo: "border-red-300 bg-red-50",
};

export function PilhaDeAvisos({ avisos }: { avisos: Aviso[] }) {
  return (
    <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-80 flex-col gap-2">
      {avisos.map((aviso) => (
        <div key={aviso.id} className={`pointer-events-auto rounded-md border px-4 py-3 text-sm shadow-sm ${CLASSES_DO_AVISO[aviso.tom]}`}>
          <p className="font-medium text-slate-900">{aviso.titulo}</p>
          {aviso.texto && <p className="mt-0.5 text-slate-700">{aviso.texto}</p>}
        </div>
      ))}
    </div>
  );
}

/** Abas simples, sem dependência de roteador. */
export function Abas<T extends string>({ abas, atual, aoTrocar }: { abas: { id: T; rotulo: ReactNode }[]; atual: T; aoTrocar: (id: T) => void }) {
  return (
    <div className="mb-5 flex flex-wrap gap-1 border-b border-slate-200">
      {abas.map((aba) => (
        <button
          key={aba.id}
          onClick={() => aoTrocar(aba.id)}
          aria-pressed={aba.id === atual}
          className={`-mb-px min-h-10 border-b-2 px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
            aba.id === atual ? "border-slate-900 text-slate-900" : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          {aba.rotulo}
        </button>
      ))}
    </div>
  );
}
