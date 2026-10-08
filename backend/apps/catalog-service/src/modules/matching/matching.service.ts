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
      nome: exibicao.nome,
      principioAtivo: exibicao.principioAtivo,
      principioNormalizado: oferta.principioNormalizado,
      concentracaoValor: oferta.concentracao.valor,
      concentracaoUnidade: oferta.concentracao.unidade,
      forma: oferta.forma,
      quantidadeValor: oferta.quantidade.valor,
      quantidadeUnidade: oferta.quantidade.unidade,
      fabricante: oferta.fabricante,
      categoria: oferta.categoria,
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
