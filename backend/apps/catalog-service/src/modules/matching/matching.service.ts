import { gerarId } from '@pricehub/contracts'
import type {
  AlteracaoDeMedicamento,
  Medicamento,
  MedicamentosRepository,
} from '../catalogo/medicamentos.repository.js'
import { nomeDeExibicao, type OfertaNormalizada } from './normalizacao.js'
import { estrategiasPadrao, type MatchingStrategy, type NomeDaEstrategia } from './strategies.js'

export type ResultadoDoMatching =
  | { tipo: 'casado'; medicamento: Medicamento; estrategia: NomeDaEstrategia; enriquecido: boolean }
  | { tipo: 'novo'; medicamento: Medicamento }
  | { tipo: 'nao-correspondido'; motivo: string }

const fonteComRegistro = 'registro'
const fonteSomenteDescricao = 'descricao'

export class MatchingService {
  constructor(private readonly estrategias: readonly MatchingStrategy[] = estrategiasPadrao) {}

  async casar(oferta: OfertaNormalizada, medicamentos: MedicamentosRepository): Promise<ResultadoDoMatching> {
    if (!oferta.principioNormalizado) {
      return { tipo: 'nao-correspondido', motivo: 'princípio ativo não identificado' }
    }
    for (const estrategia of this.estrategias) {
      const medicamento = await estrategia.encontrar(oferta, medicamentos)
      if (medicamento) {
        const enriquecido = await this.enriquecer(medicamento, oferta, medicamentos)
        return {
          tipo: 'casado',
          medicamento: enriquecido ?? medicamento,
          estrategia: estrategia.nome,
          enriquecido: enriquecido !== null,
        }
      }
    }
    if (!oferta.chaveCanonica) {
      return {
        tipo: 'nao-correspondido',
        motivo: 'forma farmacêutica não identificada e nenhum registro MS ou EAN conhecido',
      }
    }
    return { tipo: 'novo', medicamento: await medicamentos.criar(this.novoMedicamento(oferta)) }
  }

  private novoMedicamento(oferta: OfertaNormalizada): Medicamento {
    const exibicao = nomeDeExibicao(oferta)
    return {
      id: gerarId(),
      chaveCanonica: oferta.chaveCanonica!,
      registroMs: oferta.registroMs,
      ean: oferta.ean,
      nome: oferta.nomeExibicao ?? exibicao.nome,
      principioAtivo: oferta.principioAtivoExibicao ?? exibicao.principioAtivo,
      principioNormalizado: oferta.principioNormalizado,
      concentracaoValor: oferta.concentracao.valor,
      concentracaoUnidade: oferta.concentracao.unidade,
      forma: oferta.forma,
      quantidadeValor: oferta.quantidade.valor,
      quantidadeUnidade: oferta.quantidade.unidade,
      fabricante: oferta.fabricante,
      categoria: oferta.categoria,
      slug: oferta.slug ?? null,
      nomeExibicao: oferta.nomeExibicao ?? null,
      dosagem: oferta.dosagem ?? null,
      principioAtivoExibicao: oferta.principioAtivoExibicao ?? null,
      apresentacaoExibicao: oferta.apresentacaoExibicao ?? null,
      laboratorio: oferta.laboratorio ?? oferta.fabricante,
      tarja: oferta.tarja ?? null,
      tarjaTipo: oferta.tarjaTipo ?? null,
      imagem: oferta.imagem ?? null,
      descricao: oferta.descricao ?? null,
      indicacao: oferta.indicacao ?? null,
      modoDeUso: oferta.modoDeUso ?? null,
      contraindicacao: oferta.contraindicacao ?? null,
      avaliacao: oferta.avaliacao ?? null,
      avaliacoesTotal: oferta.avaliacoesTotal ?? null,
      fonteDosDados: oferta.registroMs ? fonteComRegistro : fonteSomenteDescricao,
    }
  }

  private async enriquecer(
    medicamento: Medicamento,
    oferta: OfertaNormalizada,
    medicamentos: MedicamentosRepository,
  ): Promise<Medicamento | null> {
    const alteracao: AlteracaoDeMedicamento = {}
    if (
      !medicamento.registroMs &&
      oferta.registroMs &&
      !(await medicamentos.porRegistroMs(oferta.registroMs))
    ) {
      alteracao.registroMs = oferta.registroMs
    }
    if (!medicamento.ean && oferta.ean && !(await medicamentos.porEan(oferta.ean))) {
      alteracao.ean = oferta.ean
    }
    if (!medicamento.categoria && oferta.categoria) alteracao.categoria = oferta.categoria
    if (!medicamento.slug && oferta.slug) alteracao.slug = oferta.slug
    if (!medicamento.nomeExibicao && oferta.nomeExibicao) alteracao.nomeExibicao = oferta.nomeExibicao
    if (!medicamento.dosagem && oferta.dosagem) alteracao.dosagem = oferta.dosagem
    if (!medicamento.principioAtivoExibicao && oferta.principioAtivoExibicao) {
      alteracao.principioAtivoExibicao = oferta.principioAtivoExibicao
    }
    if (!medicamento.apresentacaoExibicao && oferta.apresentacaoExibicao) {
      alteracao.apresentacaoExibicao = oferta.apresentacaoExibicao
    }
    if (!medicamento.laboratorio && (oferta.laboratorio || oferta.fabricante)) {
      alteracao.laboratorio = oferta.laboratorio ?? oferta.fabricante
    }
    if (!medicamento.tarja && oferta.tarja) alteracao.tarja = oferta.tarja
    if (!medicamento.tarjaTipo && oferta.tarjaTipo) alteracao.tarjaTipo = oferta.tarjaTipo
    if (!medicamento.imagem && oferta.imagem) alteracao.imagem = oferta.imagem
    if (!medicamento.descricao && oferta.descricao) alteracao.descricao = oferta.descricao
    if (!medicamento.indicacao && oferta.indicacao) alteracao.indicacao = oferta.indicacao
    if (!medicamento.modoDeUso && oferta.modoDeUso) alteracao.modoDeUso = oferta.modoDeUso
    if (!medicamento.contraindicacao && oferta.contraindicacao)
      alteracao.contraindicacao = oferta.contraindicacao
    if (medicamento.avaliacao === null && oferta.avaliacao !== undefined)
      alteracao.avaliacao = oferta.avaliacao
    if (medicamento.avaliacoesTotal === null && oferta.avaliacoesTotal !== undefined) {
      alteracao.avaliacoesTotal = oferta.avaliacoesTotal
    }
    if (!medicamento.fabricante && oferta.fabricante) alteracao.fabricante = oferta.fabricante
    if (medicamento.fonteDosDados === fonteSomenteDescricao && oferta.registroMs) {
      const exibicao = nomeDeExibicao(oferta)
      alteracao.nome = exibicao.nome
      alteracao.principioAtivo = exibicao.principioAtivo
      alteracao.fonteDosDados = fonteComRegistro
      if (oferta.fabricante) alteracao.fabricante = oferta.fabricante
    }
    if (Object.keys(alteracao).length === 0) return null
    return medicamentos.atualizar(medicamento.id, alteracao)
  }
}
