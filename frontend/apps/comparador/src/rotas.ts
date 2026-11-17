import { useEffect, useState } from "react";

export type Rota = { pagina: "lista" } | { pagina: "medicamento"; id: string } | { pagina: "parceiras" } | { pagina: "nao-encontrada" };

export function interpretar(caminho: string): Rota {
  const limpo = caminho.replace(/\/+$/, "") || "/";
  if (limpo === "/") return { pagina: "lista" };
  if (limpo === "/parceiras") return { pagina: "parceiras" };
  const medicamento = limpo.match(/^\/medicamento\/([^/]+)$/);
  if (medicamento) return { pagina: "medicamento", id: decodeURIComponent(medicamento[1]) };
  return { pagina: "nao-encontrada" };
}

/** Navega sem recarregar a página (o gateway devolve o index.html para qualquer rota do comparador). */
export function navegar(caminho: string) {
  window.history.pushState(null, "", caminho);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo(0, 0);
}

export function useRota(): Rota {
  const [rota, setRota] = useState(() => interpretar(window.location.pathname));
  useEffect(() => {
    const aoMudar = () => setRota(interpretar(window.location.pathname));
    window.addEventListener("popstate", aoMudar);
    return () => window.removeEventListener("popstate", aoMudar);
  }, []);
  return rota;
}

/** Link interno: clique normal navega pela SPA; ctrl/cmd+clique abre em outra aba normalmente. */
export function aoClicarNoLink(caminho: string) {
  return (evento: React.MouseEvent<HTMLAnchorElement>) => {
    if (evento.ctrlKey || evento.metaKey || evento.shiftKey || evento.button !== 0) return;
    evento.preventDefault();
    navegar(caminho);
  };
}
