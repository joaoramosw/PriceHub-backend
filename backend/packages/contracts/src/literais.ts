import Type, { type TLiteral, type TUnion } from 'typebox'

export function UniaoDeLiterais<const Valores extends readonly string[]>(
  valores: Valores,
): TUnion<{ -readonly [Indice in keyof Valores]: TLiteral<Valores[Indice]> }> {
  return Type.Union(valores.map((valor) => Type.Literal(valor))) as never
}
