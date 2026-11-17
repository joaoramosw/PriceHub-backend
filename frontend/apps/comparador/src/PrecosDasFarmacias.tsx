import { FARMACIAS, type OfertaComparada } from "@pricehub/api";
import { formatarDataHora, formatarPreco, temaDa } from "@pricehub/ui";

/**
 * Os três preços de um medicamento, sempre na mesma ordem de farmácias (o olho compara cartões
 * lado a lado). O menor preço disponível fica em destaque. Cada linha abre a página do produto na loja.
 */
export function PrecosDasFarmacias({ ofertas, tamanho = "compacto" }: { ofertas: OfertaComparada[]; tamanho?: "compacto" | "grande" }) {
  const porFarmacia = new Map(ofertas.map((oferta) => [oferta.farmaciaId, oferta]));
  const grande = tamanho === "grande";

  return (
    <ul className={grande ? "grid gap-3 md:grid-cols-3" : "divide-y divide-slate-100 rounded-md border border-slate-200"}>
      {FARMACIAS.map((farmacia) => {
        const oferta = porFarmacia.get(farmacia.id);
        const disponivel = oferta?.disponivel ?? false;
        const maisBarata = oferta?.posicao === 1;
        const tema = temaDa(farmacia.id);
        const conteudo = (
          <>
            <span className="flex min-w-0 items-center gap-2">
              <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${tema.ponto}`} />
              <span className="truncate text-slate-700">{farmacia.nome}</span>
            </span>
            <span className="flex shrink-0 items-baseline gap-2">
              {maisBarata && <span className="text-xs font-medium text-emerald-800">menor preço</span>}
              {!maisBarata && disponivel && !!oferta?.diferencaParaOMenorCentavos && (
                <span className="text-xs text-slate-500 tabular-nums">+{formatarPreco(oferta.diferencaParaOMenorCentavos)}</span>
              )}
              <span
                className={`tabular-nums ${grande ? "text-2xl" : "text-base"} font-semibold ${disponivel ? "text-slate-900" : "text-slate-400"}`}
              >
                {oferta ? (disponivel ? formatarPreco(oferta.precoCentavos) : "indisponível") : "sem oferta"}
              </span>
            </span>
          </>
        );
        const classes = grande
          ? `flex h-full min-h-10 flex-col gap-2 rounded-lg border p-4 ${maisBarata ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white"}`
          : `flex min-h-10 items-center justify-between gap-3 px-3 py-2 text-sm ${maisBarata ? "bg-emerald-50" : ""}`;

        return (
          <li key={farmacia.id}>
            {oferta?.urlDoProduto && disponivel ? (
              <a
                href={oferta.urlDoProduto}
                target="_blank"
                rel="noreferrer"
                title={`Abrir "${oferta.nomeNaFarmacia}" no site da ${farmacia.nome}`}
                className={`${classes} transition-colors duration-150 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${maisBarata ? "hover:bg-emerald-100" : ""}`}
              >
                {conteudo}
                {grande && <AtualizadoEm oferta={oferta} />}
                {grande && <span className="text-sm font-medium text-slate-900 underline">Ver na farmácia</span>}
              </a>
            ) : (
              <div className={classes}>
                {conteudo}
                {grande && oferta && <AtualizadoEm oferta={oferta} />}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** RNF-08: data e hora em que a farmácia alterou o preço exibido (ou, sem essa informação, em que o PriceHub o recebeu). */
function AtualizadoEm({ oferta }: { oferta: OfertaComparada }) {
  const instante = oferta.atualizadoNaOrigemEm ?? oferta.atualizadoEm;
  return (
    <span className="text-xs text-slate-600 tabular-nums">
      Atualizado em <time dateTime={instante}>{formatarDataHora(instante)}</time>
    </span>
  );
}
