import { useEffect, useState } from 'react'
import { listarMedicamentos } from '../api/client'
import type { Medicamento } from '../types'

export function useMedicamentos(busca: string, categoria: string) {
  const [itens, setItens] = useState<Medicamento[]>([])
  const [categorias, setCategorias] = useState<string[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [tentativa, setTentativa] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setCarregando(true)
    setErro(null)
    void listarMedicamentos(busca, categoria, controller.signal, tentativa > 0)
      .then((pagina) => {
        setItens(pagina.itens)
        setCategorias(
          [
            ...new Set(
              pagina.itens
                .map((item) => item.categoria)
                .filter(Boolean) as string[],
            ),
          ].sort(),
        )
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setErro(
            cause instanceof Error
              ? cause.message
              : 'Falha ao carregar medicamentos.',
          )
      })
      .finally(() => {
        if (!controller.signal.aborted) setCarregando(false)
      })
    return () => controller.abort()
  }, [busca, categoria, tentativa])

  return {
    itens,
    setItens,
    categorias,
    carregando,
    erro,
    tentarNovamente: () => setTentativa((n) => n + 1),
  }
}
