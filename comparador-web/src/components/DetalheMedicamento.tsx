import { useComparacao } from '../hooks/useComparacao'
import { formatarBRL, formatarData, mapearImagem } from '../lib/formatacao'
import { Erro, Esqueletos } from './Estados'

export function DetalheMedicamento({
  id,
  versao,
}: {
  id: string
  versao: number
}) {
  const { dados, carregando, erro, tentarNovamente } = useComparacao(id, versao)
  if (carregando)
    return (
      <main className="principal">
        <Esqueletos />
      </main>
    )
  if (erro || !dados)
    return (
      <main className="principal">
        <Erro
          mensagem={erro ?? 'Medicamento não encontrado.'}
          tentarNovamente={tentarNovamente}
        />
      </main>
    )
  const { medicamento, ofertas } = dados
  const imagem = mapearImagem(medicamento.imagem)

  return (
    <main className="principal detalhe-pagina">
      <a className="voltar" href="/">
        ← Voltar ao comparador
      </a>
      <section className="detalhe-hero">
        <div className="detalhe-foto">
          {imagem ? (
            <>
              <img
                src={imagem}
                alt={medicamento.nome}
                onError={(evento) => {
                  evento.currentTarget.hidden = true
                  evento.currentTarget.parentElement
                    ?.querySelector('.placeholder-imagem')
                    ?.removeAttribute('hidden')
                }}
              />
              <span className="placeholder-imagem" aria-hidden="true" hidden>
                ✳
              </span>
            </>
          ) : (
            <span
              role="img"
              aria-label={`Imagem de ${medicamento.nome} indisponível`}
            >
              ✳
            </span>
          )}
        </div>
        <div className="detalhe-titulo">
          <span className="sobretitulo">{medicamento.categoria}</span>
          <h1>{medicamento.nome}</h1>
          <p>
            {medicamento.dosagem ?? medicamento.concentracao} <span>·</span>{' '}
            {medicamento.apresentacao}
          </p>
          <span
            className={`selo ${medicamento.tarjaTipo === 'vermelha' ? 'selo-vermelho' : 'selo-livre'}`}
          >
            {medicamento.tarja ?? 'Venda livre'}
          </span>
          {medicamento.avaliacao !== null && (
            <p className="avaliacao">
              <strong>★ {medicamento.avaliacao.toFixed(1)}</strong> ·{' '}
              {medicamento.avaliacoesTotal} avaliações
            </p>
          )}
          <div className="metadados">
            <span>
              <small>Laboratório</small>
              {medicamento.laboratorio ?? 'Não informado'}
            </span>
            <span>
              <small>Princípio ativo</small>
              {medicamento.principioAtivo}
            </span>
            <span>
              <small>Registro MS</small>
              {medicamento.registroMS ?? 'Não informado'}
            </span>
          </div>
        </div>
      </section>
      {(medicamento.descricao ||
        medicamento.indicacao ||
        medicamento.modoDeUso ||
        medicamento.contraindicacao) && (
        <section className="informacoes">
          <h2>Sobre o medicamento</h2>
          <div className="informacoes-grade">
            {medicamento.descricao && (
              <article>
                <h3>Descrição</h3>
                <p>{medicamento.descricao}</p>
              </article>
            )}
            {medicamento.indicacao && (
              <article>
                <h3>Indicação</h3>
                <p>{medicamento.indicacao}</p>
              </article>
            )}
            {medicamento.modoDeUso && (
              <article>
                <h3>Modo de uso</h3>
                <p>{medicamento.modoDeUso}</p>
              </article>
            )}
            {medicamento.contraindicacao && (
              <article>
                <h3>Contraindicação</h3>
                <p>{medicamento.contraindicacao}</p>
              </article>
            )}
          </div>
        </section>
      )}
      <section className="comparacao">
        <div className="secao-cabecalho">
          <div>
            <span className="sobretitulo">Compare antes de comprar</span>
            <h2>Preços nas farmácias</h2>
          </div>
          <span className="disponibilidade">
            {ofertas.length} ofertas encontradas
          </span>
        </div>
        <div className="ofertas">
          {ofertas.map((oferta) => (
            <article
              className={`oferta ${oferta.ehMenorPreco ? 'oferta-menor' : ''}`}
              key={oferta.farmaciaId}
            >
              <div className="farmacia-marca" aria-hidden="true">
                {oferta.farmacia.slice(0, 1)}
              </div>
              <div className="oferta-dados">
                <strong>{oferta.farmacia}</strong>
                <span>Atualizado em {formatarData(oferta.atualizadoEm)}</span>
                {oferta.ehMenorPreco && (
                  <span className="menor-selo">Menor preço</span>
                )}
              </div>
              <div className="oferta-preco">
                <strong>{formatarBRL(oferta.precoCentavos)}</strong>
                {!oferta.ehMenorPreco && (
                  <span>
                    + {formatarBRL(oferta.diferencaParaMenorCentavos)} (
                    {medicamento.menorPrecoCentavos
                      ? Math.round(
                          (oferta.diferencaParaMenorCentavos /
                            medicamento.menorPrecoCentavos) *
                            100,
                        )
                      : 0}
                    %)
                  </span>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
      <p className="aviso-medico">
        As informações não substituem a orientação de um profissional de saúde.
      </p>
    </main>
  )
}
