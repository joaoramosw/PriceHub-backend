import type { FormaFarmaceutica, Quantidade } from '@pricehub/contracts'
import type { Transacao } from '../../plugins/prisma.js'

export type Medicamento = {
  id: string
  chaveCanonica: string
  registroMs: string | null
  ean: string | null
  nome: string
  principioAtivo: string
  principioNormalizado: string
  concentracaoValor: number
  concentracaoUnidade: string
  forma: string
  quantidadeValor: number
  quantidadeUnidade: string
  fabricante: string | null
  categoria: string | null
  slug: string | null
  nomeExibicao: string | null
  dosagem: string | null
  principioAtivoExibicao: string | null
  apresentacaoExibicao: string | null
  laboratorio: string | null
  tarja: string | null
  tarjaTipo: string | null
  imagem: string | null
  descricao: string | null
  indicacao: string | null
  modoDeUso: string | null
  contraindicacao: string | null
  avaliacao: number | null
  avaliacoesTotal: number | null
  fonteDosDados: string
}

export type NovoMedicamento = Medicamento

export type AlteracaoDeMedicamento = Partial<
  Pick<
    Medicamento,
    | 'registroMs'
    | 'ean'
    | 'nome'
    | 'principioAtivo'
    | 'fabricante'
    | 'categoria'
    | 'fonteDosDados'
    | 'slug'
    | 'nomeExibicao'
    | 'dosagem'
    | 'principioAtivoExibicao'
    | 'apresentacaoExibicao'
    | 'laboratorio'
    | 'tarja'
    | 'tarjaTipo'
    | 'imagem'
    | 'descricao'
    | 'indicacao'
    | 'modoDeUso'
    | 'contraindicacao'
    | 'avaliacao'
    | 'avaliacoesTotal'
  >
>

export class MedicamentosRepository {
  constructor(private readonly db: Transacao) {}

  porRegistroMs(registroMs: string): Promise<Medicamento | null> {
    return this.db.medicamento.findUnique({ where: { registroMs } })
  }

  porEan(ean: string): Promise<Medicamento | null> {
    return this.db.medicamento.findUnique({ where: { ean } })
  }

  porChaveCanonica(chaveCanonica: string): Promise<Medicamento | null> {
    return this.db.medicamento.findUnique({ where: { chaveCanonica } })
  }

  criar(medicamento: NovoMedicamento): Promise<Medicamento> {
    return this.db.medicamento.create({ data: medicamento })
  }

  atualizar(id: string, alteracao: AlteracaoDeMedicamento): Promise<Medicamento> {
    return this.db.medicamento.update({ where: { id }, data: alteracao })
  }
}

export function dadosDoEventoDeMedicamento(medicamento: Medicamento) {
  return {
    medicamentoId: medicamento.id,
    nome: medicamento.nome,
    principioAtivo: medicamento.principioAtivo,
    concentracao: {
      valor: medicamento.concentracaoValor,
      unidade: medicamento.concentracaoUnidade as 'mg' | 'mg/ml' | 'g' | 'ml' | 'mcg',
    },
    forma: medicamento.forma as FormaFarmaceutica,
    quantidade: {
      valor: medicamento.quantidadeValor,
      unidade: medicamento.quantidadeUnidade as Quantidade['unidade'],
    },
    categoria: medicamento.categoria,
    slug: medicamento.slug,
    nomeExibicao: medicamento.nomeExibicao,
    dosagem: medicamento.dosagem,
    principioAtivoExibicao: medicamento.principioAtivoExibicao,
    apresentacaoExibicao: medicamento.apresentacaoExibicao,
    laboratorio: medicamento.laboratorio,
    registroMs: medicamento.registroMs,
    tarja: medicamento.tarja,
    tarjaTipo: medicamento.tarjaTipo,
    imagem: medicamento.imagem,
    descricao: medicamento.descricao,
    indicacao: medicamento.indicacao,
    modoDeUso: medicamento.modoDeUso,
    contraindicacao: medicamento.contraindicacao,
    avaliacao: medicamento.avaliacao,
    avaliacoesTotal: medicamento.avaliacoesTotal,
  }
}
