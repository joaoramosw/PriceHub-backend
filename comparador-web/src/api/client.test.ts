import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, buscarComparacao, listarMedicamentos } from './client'

afterEach(() => vi.restoreAllMocks())

describe('cliente da API', () => {
  it('envia busca e categoria ao endpoint público', async () => {
    const fetchSimulado = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        itens: [],
        page: 1,
        pageSize: 100,
        total: 0,
        totalPages: 1,
      }),
    })
    vi.stubGlobal('fetch', fetchSimulado)

    await listarMedicamentos('losartana', 'Hipertensão', undefined, true)

    expect(fetchSimulado).toHaveBeenCalledWith(
      'http://127.0.0.1:3000/medicamentos?page=1&pageSize=100&busca=losartana&categoria=Hipertens%C3%A3o',
      expect.objectContaining({ cache: 'reload' }),
    )
  })

  it('preserva o erro problem+json da API de comparação', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ detail: 'Medicamento não encontrado.' }),
      }),
    )

    await expect(buscarComparacao('inexistente')).rejects.toEqual(
      new ApiError('Medicamento não encontrado.', 404),
    )
  })
})
