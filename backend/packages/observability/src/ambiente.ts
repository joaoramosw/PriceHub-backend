import type { Static, TSchema } from 'typebox'
import { Value } from 'typebox/value'

export class AmbienteInvalidoError extends Error {
  constructor(erros: string[]) {
    super(`variáveis de ambiente inválidas: ${erros.join('; ')}`)
    this.name = 'AmbienteInvalidoError'
  }
}

export function carregarAmbiente<Schema extends TSchema>(
  schema: Schema,
  fonte: Record<string, string | undefined> = process.env,
): Static<Schema> {
  const definidas = Object.fromEntries(
    Object.entries(fonte).filter(([, valor]) => valor !== undefined && valor !== ''),
  )
  const valor = Value.Default(schema, Value.Convert(schema, definidas))
  if (!Value.Check(schema, valor)) {
    throw new AmbienteInvalidoError(
      Value.Errors(schema, valor).map((erro) => `${erro.instancePath || '/'} ${erro.message}`),
    )
  }
  return valor as Static<Schema>
}
