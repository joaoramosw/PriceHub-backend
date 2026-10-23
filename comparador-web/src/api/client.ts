import type { Comparacao, Pagina } from '../types'

const baseUrl = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:3000'

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

async function request<T>(
  path: string,
  signal?: AbortSignal,
  reload = false,
): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    signal,
    cache: reload ? 'reload' : 'default',
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) {
    const problema = (await response.json().catch(() => null)) as {
      detail?: string
      title?: string
    } | null
    throw new ApiError(
      problema?.detail ??
        problema?.title ??
        'Não foi possível carregar os dados.',
      response.status,
    )
  }
  return (await response.json()) as T
}

export function listarMedicamentos(
  busca: string,
  categoria: string,
  signal?: AbortSignal,
  reload = false,
): Promise<Pagina> {
  const params = new URLSearchParams({ page: '1', pageSize: '100' })
  if (busca) params.set('busca', busca)
  if (categoria) params.set('categoria', categoria)
  return request(`/medicamentos?${params}`, signal, reload)
}

export function buscarComparacao(
  id: string,
  signal?: AbortSignal,
  reload = false,
): Promise<Comparacao> {
  return request(
    `/medicamentos/${encodeURIComponent(id)}/comparacao`,
    signal,
    reload,
  )
}

export function listarCategorias(
  signal?: AbortSignal,
): Promise<{ categoria: string; qtdMedicamentos: number }[]> {
  return request('/categorias', signal)
}

export const urlDoStream = `${baseUrl}/eventos/stream`
