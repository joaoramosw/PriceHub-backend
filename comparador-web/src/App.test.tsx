import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { Comparacao, Medicamento, Pagina } from './types'

const item: Medicamento = {
  id: 'med-losartana',
  nome: 'Losartana Potássica',
  principioAtivo: 'Losartana Potássica 50mg',
  concentracao: '50mg',
  dosagem: '50mg',
  apresentacao: '30 comprimidos revestidos',
  slug: 'losartana-potassica-50mg',
  categoria: 'Hipertensão & Coração',
  laboratorio: 'Medley / Eurofarma',
  registroMS: '1018104210023',
  tarja: 'Tarja Vermelha (Sob Prescrição)',
  tarjaTipo: 'vermelha',
  imagem: 'images/losartana.jpg',
  descricao: 'Controle da pressão arterial.',
  indicacao: 'Hipertensão.',
  modoDeUso: 'Uma vez ao dia.',
  contraindicacao: 'Hipersensibilidade.',
  avaliacao: 4.8,
  avaliacoesTotal: 640,
  farmaciaMaisBarata: 'DrogaPopular Express',
  menorPrecoCentavos: 749,
  maiorPrecoCentavos: 1150,
  qtdFarmacias: 3,
  economiaMaximaCentavos: 401,
  atualizadoEm: '2026-10-22T00:00:00.000Z',
}

const comparacao: Comparacao = {
  medicamento: item,
  ofertas: [
    {
      farmaciaId: 'drogapopular',
      farmacia: 'DrogaPopular Express',
      precoCentavos: 749,
      atualizadoEm: item.atualizadoEm,
      ehMenorPreco: true,
      diferencaParaMenorCentavos: 0,
    },
    {
      farmaciaId: 'farmaazul',
      farmacia: 'FarmaAzul Confiança',
      precoCentavos: 890,
      atualizadoEm: item.atualizadoEm,
      ehMenorPreco: false,
      diferencaParaMenorCentavos: 141,
    },
    {
      farmaciaId: 'biofarma',
      farmacia: 'BioFarma Verde',
      precoCentavos: 1150,
      atualizadoEm: item.atualizadoEm,
      ehMenorPreco: false,
      diferencaParaMenorCentavos: 401,
    },
  ],
}

class EventSourceFalso {
  static atual: EventSourceFalso
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  readonly ouvintes = new Map<string, EventListener>()
  fechado = false
  constructor() {
    EventSourceFalso.atual = this
    queueMicrotask(() => this.onopen?.())
  }
  addEventListener(tipo: string, listener: EventListener) {
    this.ouvintes.set(tipo, listener)
  }
  removeEventListener(tipo: string) {
    this.ouvintes.delete(tipo)
  }
  close() {
    this.fechado = true
  }
  emitir(tipo: string, dados: unknown) {
    this.ouvintes.get(tipo)?.(
      new MessageEvent(tipo, { data: JSON.stringify(dados) }),
    )
  }
}

let precoAzulCentavos = 890

function resposta(dados: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(dados) })
}

beforeEach(() => {
  precoAzulCentavos = 890
  window.history.replaceState(null, '', '/')
  globalThis.EventSource = EventSourceFalso as unknown as typeof EventSource
  globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith('/categorias'))
      return resposta([
        { categoria: 'Hipertensão & Coração', qtdMedicamentos: 1 },
      ]) as never
    if (url.includes('/comparacao')) {
      const ofertas = comparacao.ofertas.map((oferta) =>
        oferta.farmaciaId === 'farmaazul'
          ? { ...oferta, precoCentavos: precoAzulCentavos }
          : oferta,
      )
      const menorPreco = Math.min(
        ...ofertas.map((oferta) => oferta.precoCentavos),
      )
      return resposta({
        ...comparacao,
        ofertas: ofertas
          .map((oferta) => ({
            ...oferta,
            ehMenorPreco: oferta.precoCentavos === menorPreco,
            diferencaParaMenorCentavos: oferta.precoCentavos - menorPreco,
          }))
          .sort((a, b) => a.precoCentavos - b.precoCentavos),
      }) as never
    }
    const pagina: Pagina = {
      itens: url.includes('busca=') && !url.includes('losartana') ? [] : [item],
      page: 1,
      pageSize: 100,
      total: 1,
      totalPages: 1,
    }
    return resposta(pagina) as never
  }) as typeof fetch
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('comparador web', () => {
  it('debounceia a busca e mostra estado vazio quando não há resultados', async () => {
    const usuario = userEvent.setup()
    render(<App />)
    expect(await screen.findByText(/Losartana Potássica/)).toBeInTheDocument()
    await usuario.type(
      screen.getByPlaceholderText('Nome do medicamento ou princípio ativo'),
      'xyz',
    )
    expect(
      await screen.findByText('Nenhum medicamento encontrado.'),
    ).toBeInTheDocument()
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('busca=xyz'),
      expect.anything(),
    )
  })

  it('apresenta erro e permite tentar novamente', async () => {
    let falhar = true
    globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/categorias')) return resposta([]) as never
      if (falhar)
        return Promise.resolve({
          ok: false,
          status: 503,
          json: () => Promise.resolve({ detail: 'API indisponível.' }),
        }) as never
      return resposta({
        itens: [item],
        page: 1,
        pageSize: 100,
        total: 1,
        totalPages: 1,
      }) as never
    }) as typeof fetch
    const usuario = userEvent.setup()

    render(<App />)

    expect(await screen.findByText('API indisponível.')).toBeInTheDocument()
    falhar = false
    await usuario.click(
      screen.getByRole('button', { name: 'Tentar novamente' }),
    )
    expect(await screen.findByText(/Losartana Potássica/)).toBeInTheDocument()
  })

  it('abre uma rota direta com a menor oferta em primeiro lugar', async () => {
    precoAzulCentavos = 720
    window.history.replaceState(null, '', `/medicamentos/${item.id}`)

    render(<App />)

    expect(await screen.findByText('Preços nas farmácias')).toBeInTheDocument()
    expect(
      screen.getByText('FarmaAzul Confiança').closest('article'),
    ).toHaveClass('oferta-menor')
    expect(screen.getByText('FarmaAzul Confiança').closest('article')).toBe(
      document.querySelector('.ofertas article'),
    )
  })

  it('abre o detalhe, compara as três farmácias e aplica atualização SSE sem reload', async () => {
    render(<App />)
    await screen.findByText(/Losartana Potássica/)
    fireEvent.click(
      screen.getByRole('link', {
        name: /Ver comparação de Losartana Potássica/,
      }),
    )
    expect(await screen.findByText('Preços nas farmácias')).toBeInTheDocument()
    expect(screen.getAllByText('BioFarma Verde').length).toBeGreaterThan(0)
    expect(screen.getAllByText('FarmaAzul Confiança').length).toBeGreaterThan(0)
    expect(
      screen.getAllByText(
        (texto) => texto.replaceAll('\u00a0', ' ') === 'R$ 7,49',
      ).length,
    ).toBeGreaterThan(0)
    window.history.replaceState(null, '', '/')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await screen.findByText(/Losartana Potássica/)
    precoAzulCentavos = 720
    EventSourceFalso.atual.emitir('oferta-atualizada', {
      medicamentoId: item.id,
      nome: item.nome,
      farmaciaId: 'farmaazul',
      farmaciaNome: 'FarmaAzul Confiança',
      precoAnteriorCentavos: 890,
      precoAtualCentavos: 720,
      menorPrecoCentavos: 720,
      maiorPrecoCentavos: 1150,
      qtdFarmacias: 3,
      farmaciaMaisBarata: 'FarmaAzul Confiança',
      ofertas: [],
      atualizadoEm: '2026-10-22T00:01:00.000Z',
      correlationId: 'corr',
      eventId: 'evt',
    })
    await waitFor(() =>
      expect(
        screen.getByText(
          (texto) => texto.replaceAll('\u00a0', ' ') === 'R$ 7,20',
        ),
      ).toBeInTheDocument(),
    )
    expect(screen.getByText('FarmaAzul Confiança')).toBeInTheDocument()
    expect(
      document.querySelector('[aria-live="polite"]')?.textContent,
    ).toContain('FarmaAzul Confiança por R$\u00a07,20.')
    expect(EventSourceFalso.atual.fechado).toBe(false)
  })
})
