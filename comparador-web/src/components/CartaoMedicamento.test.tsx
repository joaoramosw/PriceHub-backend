import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Medicamento } from '../types'
import { CartaoMedicamento } from './CartaoMedicamento'

const item: Medicamento = {
  id: 'med-2',
  nome: 'Losartana Potássica 50mg',
  principioAtivo: 'Losartana Potássica',
  concentracao: '50mg',
  dosagem: '50mg',
  apresentacao: '30 comprimidos revestidos',
  slug: 'losartana-potassica-50mg',
  categoria: 'Hipertensão & Coração',
  laboratorio: 'Medley / Eurofarma',
  registroMS: '1018104210023',
  tarja: 'Tarja Vermelha',
  tarjaTipo: 'vermelha',
  imagem: 'images/losartana.jpg',
  descricao: null,
  indicacao: null,
  modoDeUso: null,
  contraindicacao: null,
  avaliacao: 4.8,
  avaliacoesTotal: 640,
  farmaciaMaisBarata: 'DrogaPopular Express',
  menorPrecoCentavos: 749,
  maiorPrecoCentavos: 1150,
  qtdFarmacias: 3,
  economiaMaximaCentavos: 401,
  atualizadoEm: '2026-10-22T00:00:00.000Z',
}

describe('cartão de medicamento', () => {
  it('apresenta o menor preço, farmácia e disponibilidade', () => {
    render(<CartaoMedicamento medicamento={item} alterado={false} />)
    expect(
      screen.getByText(
        (texto) => texto.replaceAll('\u00a0', ' ') === 'R$ 7,49',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('DrogaPopular Express')).toBeInTheDocument()
    expect(screen.getByText('Disponível em 3 farmácias')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: item.nome })).toHaveAttribute(
      'src',
      '/medicamentos/losartana.jpg',
    )
  })
})
