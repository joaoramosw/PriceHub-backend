import { useEffect, useState } from 'react'
import { buscarComparacao } from '../api/client'
import type { Comparacao } from '../types'

export function useComparacao(id: string, versao: number) {
  const [dados, setDados] = useState<Comparacao | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [tentativa, setTentativa] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setCarregando(true)
    setErro(null)
    void buscarComparacao(id, controller.signal, tentativa > 0 || versao > 0)
      .then(setDados)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setErro(
            cause instanceof Error
              ? cause.message
              : 'Falha ao carregar comparação.',
          )
      })
      .finally(() => {
        if (!controller.signal.aborted) setCarregando(false)
      })
    return () => controller.abort()
  }, [id, tentativa, versao])

  return {
    dados,
    carregando,
    erro,
    tentarNovamente: () => setTentativa((n) => n + 1),
  }
}
