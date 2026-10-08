import type { Static, TSchema } from 'typebox'
import { Compile } from 'typebox/compile'
import { Envelope } from './envelope.js'
import {
  type Evento,
  EventosPorTipo,
  ehTipoDeEvento,
  type TipoDeEvento,
} from './eventos/catalogo-de-eventos.js'

export type ErroDeValidacao = { caminho: string; mensagem: string }

export class ContratoInvalidoError extends Error {
  constructor(
    mensagem: string,
    readonly erros: ErroDeValidacao[] = [],
  ) {
    super(
      erros.length ? `${mensagem}: ${erros.map((e) => `${e.caminho} ${e.mensagem}`).join('; ')}` : mensagem,
    )
    this.name = 'ContratoInvalidoError'
  }
}

type ValidadorCompilado = {
  Check(valor: unknown): boolean
  Errors(valor: unknown): { instancePath: string; message: string }[]
}

const validadores = new WeakMap<TSchema, ValidadorCompilado>()

function validadorDe(schema: TSchema): ValidadorCompilado {
  const existente = validadores.get(schema)
  if (existente) return existente
  const novo: ValidadorCompilado = Compile(schema)
  validadores.set(schema, novo)
  return novo
}

export function listarErros(schema: TSchema, valor: unknown): ErroDeValidacao[] {
  return validadorDe(schema)
    .Errors(valor)
    .map((erro) => ({ caminho: erro.instancePath || '/', mensagem: erro.message }))
}

export function ehValido<Schema extends TSchema>(schema: Schema, valor: unknown): valor is Static<Schema> {
  return validadorDe(schema).Check(valor)
}

export function validar<Schema extends TSchema>(
  schema: Schema,
  valor: unknown,
  contexto = 'valor',
): Static<Schema> {
  if (ehValido(schema, valor)) return valor
  throw new ContratoInvalidoError(`${contexto} inválido`, listarErros(schema, valor))
}

export function validarEvento<Tipo extends TipoDeEvento = TipoDeEvento>(
  valor: unknown,
  tiposAceitos?: readonly Tipo[],
): Evento<Tipo> {
  const envelope = validar(Envelope, valor, 'envelope')
  const tipo = envelope.type
  if (!ehTipoDeEvento(tipo)) {
    throw new ContratoInvalidoError(`tipo de evento desconhecido: ${tipo}`)
  }
  if (tiposAceitos && !(tiposAceitos as readonly string[]).includes(tipo)) {
    throw new ContratoInvalidoError(`tipo de evento não aceito: ${tipo}`)
  }
  const contrato = EventosPorTipo[tipo]
  if (envelope.version !== contrato.version) {
    throw new ContratoInvalidoError(`versão ${envelope.version} não suportada para ${tipo}`)
  }
  validar(contrato.data, envelope.data, `data de ${tipo}`)
  return envelope as Evento<Tipo>
}
