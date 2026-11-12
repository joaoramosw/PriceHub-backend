import { useState, type FormEvent } from "react";

import { apiDaFarmacia, ErroDaApi, type IdDaFarmacia, type ProdutoDaLoja, type ProdutoEntrada, type ResultadoDaOperacao } from "@pricehub/api";
import { Botao, Campo, MensagemDeErro, reaisParaCentavos } from "@pricehub/ui";

const FORMAS = [
  "comprimido",
  "comprimido revestido",
  "comprimido de liberação prolongada",
  "cápsula dura",
  "solução oral em gotas",
  "emulsão oral em gotas",
  "suspensão oral",
];
const TARJAS = ["Venda Livre", "Tarja Vermelha (Sob Prescrição)", "Tarja Preta (Controlado)"];

interface Propriedades {
  farmaciaId: IdDaFarmacia;
  produto?: ProdutoDaLoja;
  aoFechar: () => void;
  aoSalvar: (resultado: ResultadoDaOperacao, descricao: string) => void;
}

const PRODUTO_EM_BRANCO: ProdutoEntrada = {
  codigo: "",
  nomeComercial: "",
  principioAtivo: "",
  concentracao: "",
  formaFarmaceutica: "comprimido",
  quantidadeEmbalagem: 30,
  fabricante: "",
  registroMs: "",
  categoria: "",
  tarja: "Venda Livre",
  descricao: "",
  imagem: null,
  precoCentavos: 0,
};

export function FormularioDeProduto({ farmaciaId, produto, aoFechar, aoSalvar }: Propriedades) {
  const [valores, setValores] = useState<ProdutoEntrada>(produto ? { ...produto } : PRODUTO_EM_BRANCO);
  const [precoEmTexto, setPrecoEmTexto] = useState(produto ? (produto.precoCentavos / 100).toFixed(2).replace(".", ",") : "");
  const [erro, setErro] = useState<ErroDaApi | Error>();
  const [enviando, setEnviando] = useState(false);

  const alterar = <C extends keyof ProdutoEntrada>(campo: C, valor: ProdutoEntrada[C]) => setValores((atuais) => ({ ...atuais, [campo]: valor }));
  const erroDo = (campo: string) => (erro instanceof ErroDaApi ? erro.mensagemDoCampo(campo) : undefined);

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault();
    setEnviando(true);
    setErro(undefined);
    // O formulário não repete as regras: quem valida é a Web API (Pydantic). Aqui só exibimos o retorno.
    const corpo: ProdutoEntrada = { ...valores, precoCentavos: reaisParaCentavos(precoEmTexto) ?? 0, registroMs: valores.registroMs || null };
    try {
      const api = apiDaFarmacia(farmaciaId);
      const { dados } = produto ? await api.atualizar(produto.id, corpo) : await api.cadastrar(corpo);
      aoSalvar(dados, produto ? `Produto ${corpo.codigo} atualizado` : `Produto ${corpo.codigo} cadastrado`);
    } catch (falha) {
      setErro(falha as Error);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-slate-900/40 p-4" onClick={aoFechar}>
      <form onSubmit={enviar} onClick={(evento) => evento.stopPropagation()} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-slate-900">{produto ? `Editar ${produto.codigo}` : "Novo produto"}</h2>
        <p className="mb-4 text-sm text-slate-500">Os erros abaixo vêm dos validadores da API da farmácia.</p>
        {erro && !(erro instanceof ErroDaApi && erro.errosDeCampo.length) && <MensagemDeErro erro={erro} />}

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Código" value={valores.codigo} onChange={(e) => alterar("codigo", e.target.value)} erro={erroDo("codigo")} ajuda="Ex.: BIO-0011" />
          <Campo rotulo="Nome comercial" value={valores.nomeComercial} onChange={(e) => alterar("nomeComercial", e.target.value)} erro={erroDo("nomeComercial")} />
          <Campo rotulo="Princípio ativo (sem a dose)" value={valores.principioAtivo} onChange={(e) => alterar("principioAtivo", e.target.value)} erro={erroDo("principioAtivo")} />
          <Campo rotulo="Concentração" value={valores.concentracao} onChange={(e) => alterar("concentracao", e.target.value)} erro={erroDo("concentracao")} ajuda="Ex.: 500mg ou 75mg/ml" />
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Forma farmacêutica</span>
            <select value={valores.formaFarmaceutica} onChange={(e) => alterar("formaFarmaceutica", e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2">
              {FORMAS.map((forma) => (
                <option key={forma}>{forma}</option>
              ))}
            </select>
            {erroDo("formaFarmaceutica") && <span className="mt-1 block text-xs text-red-600">{erroDo("formaFarmaceutica")}</span>}
          </label>
          <Campo
            rotulo="Quantidade na embalagem"
            type="number"
            value={valores.quantidadeEmbalagem}
            onChange={(e) => alterar("quantidadeEmbalagem", Number(e.target.value))}
            erro={erroDo("quantidadeEmbalagem")}
          />
          <Campo rotulo="Fabricante" value={valores.fabricante} onChange={(e) => alterar("fabricante", e.target.value)} erro={erroDo("fabricante")} />
          <Campo rotulo="Registro MS (opcional)" value={valores.registroMs ?? ""} onChange={(e) => alterar("registroMs", e.target.value)} erro={erroDo("registroMs")} />
          <Campo rotulo="Categoria" value={valores.categoria} onChange={(e) => alterar("categoria", e.target.value)} erro={erroDo("categoria")} />
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Tarja</span>
            <select value={valores.tarja} onChange={(e) => alterar("tarja", e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2">
              {TARJAS.map((tarja) => (
                <option key={tarja}>{tarja}</option>
              ))}
            </select>
          </label>
          <Campo rotulo="Preço (R$)" value={precoEmTexto} onChange={(e) => setPrecoEmTexto(e.target.value)} erro={erroDo("precoCentavos")} ajuda="Ex.: 12,90" />
        </div>
        {erroDo("(raiz)") && <p className="mt-3 text-sm text-red-600">{erroDo("(raiz)")}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <Botao type="button" variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao type="submit" disabled={enviando}>
            {enviando ? "Enviando..." : "Salvar"}
          </Botao>
        </div>
      </form>
    </div>
  );
}
