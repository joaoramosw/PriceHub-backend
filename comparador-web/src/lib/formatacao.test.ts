import { describe, expect, it } from 'vitest'
import { formatarBRL, mapearImagem } from './formatacao'

describe('formatação de preço e imagem', () => {
  it('formata centavos inteiros em real brasileiro', () => {
    expect(formatarBRL(749)).toBe('R$ 7,49')
    expect(formatarBRL(null)).toBe('Preço indisponível')
  })

  it('mapeia o nome do arquivo para o diretório local', () => {
    expect(mapearImagem('images/losartana.jpg')).toBe(
      '/medicamentos/losartana.jpg',
    )
    expect(mapearImagem(null)).toBeNull()
  })
})
