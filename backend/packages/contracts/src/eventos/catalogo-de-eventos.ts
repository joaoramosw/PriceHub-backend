import type { Static, TSchema } from 'typebox'
import { CatalogoMedicamentoAtualizado } from './catalogo-medicamento-atualizado.js'
import { CatalogoMedicamentoCadastrado } from './catalogo-medicamento-cadastrado.js'
import { CatalogoOfertaAtualizada } from './catalogo-oferta-atualizada.js'
import { CatalogoOfertaNaoCorrespondida } from './catalogo-oferta-nao-correspondida.js'
import { IngestaoOfertaRecebida } from './ingestao-oferta-recebida.js'

export const TiposDeEvento = {
  ingestaoOfertaRecebida: 'ingestao.oferta.recebida',
  catalogoMedicamentoCadastrado: 'catalogo.medicamento.cadastrado',
  catalogoMedicamentoAtualizado: 'catalogo.medicamento.atualizado',
  catalogoOfertaAtualizada: 'catalogo.oferta.atualizada',
  catalogoOfertaNaoCorrespondida: 'catalogo.oferta.nao-correspondida',
} as const

export const EventosPorTipo = {
  'ingestao.oferta.recebida': { version: 1, data: IngestaoOfertaRecebida },
  'catalogo.medicamento.cadastrado': { version: 1, data: CatalogoMedicamentoCadastrado },
  'catalogo.medicamento.atualizado': { version: 1, data: CatalogoMedicamentoAtualizado },
  'catalogo.oferta.atualizada': { version: 1, data: CatalogoOfertaAtualizada },
  'catalogo.oferta.nao-correspondida': { version: 1, data: CatalogoOfertaNaoCorrespondida },
} as const satisfies Record<string, { version: number; data: TSchema }>

export type TipoDeEvento = keyof typeof EventosPorTipo
export type DadosDoEvento<Tipo extends TipoDeEvento> = Static<(typeof EventosPorTipo)[Tipo]['data']>

export type Evento<Tipo extends TipoDeEvento = TipoDeEvento> = {
  [T in Tipo]: {
    eventId: string
    type: T
    version: number
    occurredAt: string
    correlationId: string
    source: string
    data: DadosDoEvento<T>
  }
}[Tipo]

export function ehTipoDeEvento(tipo: string): tipo is TipoDeEvento {
  return Object.hasOwn(EventosPorTipo, tipo)
}
