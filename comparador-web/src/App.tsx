import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import { listarCategorias } from './api/client'
import { CartaoMedicamento } from './components/CartaoMedicamento'
import { DetalheMedicamento } from './components/DetalheMedicamento'
import { Erro, Esqueletos, Vazio } from './components/Estados'
import { useMedicamentos } from './hooks/useMedicamentos'
import { useStreamDeOfertas } from './hooks/useStreamDeOfertas'
import { estadoInicial, reduzirEstado } from './lib/reducer'
import './styles.css'
import type { AtualizacaoOferta } from './types'

function useBuscaComDebounce(valor: string) {
  const [debounced, setDebounced] = useState(valor)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(valor.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [valor])
  return debounced
}

export default function App() {
  const [busca, setBusca] = useState('')
  const [categoria, setCategoria] = useState('')
  const buscaAplicada = useBuscaComDebounce(busca)
  const { itens, categorias, carregando, erro, tentarNovamente } =
    useMedicamentos(buscaAplicada, categoria)
  const [estado, dispatch] = useReducer(reduzirEstado, estadoInicial)
  const [versao, setVersao] = useState(0)
  const [categoriasApi, setCategoriasApi] = useState<string[]>([])
  const [caminho, setCaminho] = useState(window.location.pathname)
  const temporizadorDeDestaque = useRef<number | null>(null)
  const demoAtiva = import.meta.env.VITE_ENABLE_DEMO === 'true'

  const receberEvento = useCallback((dados: AtualizacaoOferta) => {
    dispatch({ type: 'oferta', dados })
    setVersao((atual) => atual + 1)
    if (temporizadorDeDestaque.current !== null)
      window.clearTimeout(temporizadorDeDestaque.current)
    temporizadorDeDestaque.current = window.setTimeout(
      () => dispatch({ type: 'limpar-alteracao' }),
      1500,
    )
  }, [])
  const conexao = useStreamDeOfertas(receberEvento)

  useEffect(() => dispatch({ type: 'substituir', itens }), [itens])

  useEffect(() => {
    const controller = new AbortController()
    void listarCategorias(controller.signal)
      .then((lista) => setCategoriasApi(lista.map((item) => item.categoria)))
      .catch(() => undefined)
    return () => controller.abort()
  }, [])

  useEffect(
    () => () => {
      if (temporizadorDeDestaque.current !== null)
        window.clearTimeout(temporizadorDeDestaque.current)
    },
    [],
  )

  useEffect(() => {
    const mudar = () => setCaminho(window.location.pathname)
    window.addEventListener('popstate', mudar)
    const navegar = (evento: MouseEvent) => {
      const link = (evento.target as HTMLElement).closest('a')
      if (
        !link ||
        link.origin !== window.location.origin ||
        link.target ||
        evento.metaKey ||
        evento.ctrlKey ||
        evento.shiftKey
      )
        return
      evento.preventDefault()
      window.history.pushState(null, '', link.href)
      mudar()
      window.scrollTo(0, 0)
    }
    document.addEventListener('click', navegar)
    return () => {
      window.removeEventListener('popstate', mudar)
      document.removeEventListener('click', navegar)
    }
  }, [])

  const detalheId = useMemo(
    () => caminho.match(/^\/medicamentos\/([^/]+)$/)?.[1] ?? null,
    [caminho],
  )
  const categoriasDisponiveis =
    categoriasApi.length > 0 ? categoriasApi : categorias
  const demo = caminho === '/demo' && demoAtiva

  return (
    <div className="aplicacao">
      <header className="topo">
        <a className="marca" href="/" aria-label="PriceHub, página inicial">
          <span className="marca-simbolo">p</span>
          <span>
            price<span>hub</span>
          </span>
        </a>
        <nav aria-label="Navegação principal">
          <a className={!detalheId && !demo ? 'nav-ativo' : ''} href="/">
            Medicamentos
          </a>
          {demoAtiva && (
            <a className={demo ? 'nav-ativo' : ''} href="/demo">
              Demonstração
            </a>
          )}
        </nav>
        <span className={`status-stream status-${conexao}`}>
          <span aria-hidden="true" />
          {conexao === 'conectado'
            ? 'Ao vivo'
            : conexao === 'reconectando'
              ? 'Reconectando'
              : 'Conectando'}
        </span>
      </header>
      <div className="anuncio" aria-live="polite" aria-atomic="true">
        {estado.anuncio}
      </div>
      {detalheId ? (
        <DetalheMedicamento id={detalheId} versao={versao} />
      ) : demo ? (
        <main className="principal demo-pagina">
          <span className="sobretitulo">Demonstração técnica</span>
          <h1>Veja os preços mudarem ao vivo</h1>
          <p>
            O navegador bloqueia chamadas do comparador para o painel
            administrativo da farmácia. Execute a demonstração pelo terminal;
            esta tela acompanha o evento SSE automaticamente.
          </p>
          <pre>pnpm -C backend demo:preco</pre>
          <a className="botao primario" href="/">
            Voltar ao comparador
          </a>
        </main>
      ) : (
        <>
          <section className="hero">
            <div className="hero-conteudo">
              <span className="sobretitulo">
                Cuidado inteligente começa aqui
              </span>
              <h1>
                Encontre o melhor
                <br />
                <em>preço para sua saúde.</em>
              </h1>
              <p>
                Compare medicamentos nas farmácias da sua região e economize com
                informação.
              </p>
              <div className="hero-dados">
                <span>
                  <strong>10</strong> medicamentos
                </span>
                <span>
                  <strong>3</strong> farmácias
                </span>
                <span>
                  <strong>100%</strong> atualizado
                </span>
              </div>
            </div>
            <div className="hero-ilustracao" aria-hidden="true">
              <div className="arco arco-externo" />
              <div className="arco arco-interno" />
              <div className="cruz">＋</div>
              <div className="capsula">
                <span />
                <span />
              </div>
              <div className="hero-nota">
                Saúde que cabe
                <br />
                no seu bolso <b>↗</b>
              </div>
            </div>
          </section>
          <main className="principal">
            <section className="busca-secao">
              <div className="secao-cabecalho">
                <div>
                  <span className="sobretitulo">Seu próximo cuidado</span>
                  <h2>Compare medicamentos</h2>
                </div>
                <span className="disponibilidade">{itens.length} produtos</span>
              </div>
              <div className="controles">
                <label className="busca-campo">
                  <span aria-hidden="true">⌕</span>
                  <span className="sr-only">
                    Buscar por medicamento ou princípio ativo
                  </span>
                  <input
                    value={busca}
                    onChange={(evento) => setBusca(evento.target.value)}
                    placeholder="Nome do medicamento ou princípio ativo"
                  />
                </label>
                <label className="categoria-campo">
                  <span className="sr-only">Filtrar por categoria</span>
                  <select
                    value={categoria}
                    onChange={(evento) => setCategoria(evento.target.value)}
                  >
                    <option value="">Todas as categorias</option>
                    {categoriasDisponiveis.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
              </div>
              {carregando ? (
                <Esqueletos />
              ) : erro ? (
                <Erro mensagem={erro} tentarNovamente={tentarNovamente} />
              ) : estado.itens.length === 0 ? (
                <Vazio />
              ) : (
                <div className="grade">
                  {estado.itens.map((medicamento) => (
                    <CartaoMedicamento
                      key={medicamento.id}
                      medicamento={medicamento}
                      alterado={estado.alterado === medicamento.id}
                    />
                  ))}
                </div>
              )}
            </section>
          </main>
          <footer className="rodape">
            <a className="marca" href="/">
              <span className="marca-simbolo">p</span>
              <span>
                price<span>hub</span>
              </span>
            </a>
            <span>Compare com cuidado. Economize com confiança.</span>
            <span>Preços sujeitos a alteração.</span>
          </footer>
        </>
      )}
    </div>
  )
}
