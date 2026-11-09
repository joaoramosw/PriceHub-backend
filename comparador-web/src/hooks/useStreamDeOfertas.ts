import { useEffect, useState } from 'react'
import { urlDoStream } from '../api/client'
import type { AtualizacaoOferta } from '../types'

export function useStreamDeOfertas(
  aoAtualizar: (dados: AtualizacaoOferta) => void,
) {
  const [conexao, setConexao] = useState<
    'conectando' | 'conectado' | 'reconectando'
  >('conectando')

  useEffect(() => {
    const fonte = new EventSource(urlDoStream)
    fonte.onopen = () => setConexao('conectado')
    fonte.onerror = () => setConexao('reconectando')
    const receber = (evento: Event) => {
      const mensagem = evento as MessageEvent<string>
      try {
        aoAtualizar(JSON.parse(mensagem.data) as AtualizacaoOferta)
      } catch {
        setConexao('reconectando')
      }
    }
    fonte.addEventListener('oferta-atualizada', receber)
    return () => {
      fonte.removeEventListener('oferta-atualizada', receber)
      fonte.close()
    }
  }, [aoAtualizar])

  return conexao
}
