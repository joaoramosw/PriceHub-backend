import { formatarBRL, mapearImagem } from '../lib/formatacao'
import type { Medicamento } from '../types'

export function CartaoMedicamento({
  medicamento,
  alterado,
}: {
  medicamento: Medicamento
  alterado: boolean
}) {
  const imagem = mapearImagem(medicamento.imagem)
  return (
    <a
      className={`cartao ${alterado ? 'cartao-alterado' : ''}`}
      href={`/medicamentos/${medicamento.id}`}
      aria-label={`Ver comparação de ${medicamento.nome}`}
    >
      <div className="cartao-imagem">
        {imagem ? (
          <>
            <img
              src={imagem}
              alt={medicamento.nome}
              loading="lazy"
              onError={(evento) => {
                evento.currentTarget.hidden = true
                evento.currentTarget.parentElement
                  ?.querySelector('.placeholder-imagem')
                  ?.removeAttribute('hidden')
              }}
            />
            <span
              className="placeholder-imagem"
              role="img"
              aria-label={`Imagem de ${medicamento.nome} indisponível`}
              style={{ color: '#91b49a', fontSize: 42 }}
              hidden
            >
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
        <span
          className={`selo ${medicamento.tarjaTipo === 'vermelha' ? 'selo-vermelho' : 'selo-livre'}`}
        >
          {medicamento.tarjaTipo === 'vermelha'
            ? 'Tarja vermelha'
            : 'Venda livre'}
        </span>
      </div>
      <div className="cartao-conteudo">
        <span className="sobretitulo">{medicamento.categoria}</span>
        <h2>{medicamento.nome}</h2>
        <p className="detalhe-curto">
          {medicamento.dosagem ?? medicamento.concentracao} <span>·</span>{' '}
          {medicamento.apresentacao}
        </p>
        {medicamento.avaliacao !== null && (
          <p className="avaliacao">
            <span
              role="img"
              aria-label={`${medicamento.avaliacao} de 5 estrelas`}
            >
              ★ {medicamento.avaliacao.toFixed(1)}
            </span>{' '}
            <span>({medicamento.avaliacoesTotal ?? 0} avaliações)</span>
          </p>
        )}
        <div className="preco-linha">
          <div>
            <span className="preco-legenda">A partir de</span>
            <strong>{formatarBRL(medicamento.menorPrecoCentavos)}</strong>
          </div>
          <span className="seta" aria-hidden="true">
            ↗
          </span>
        </div>
        <div className="rodape-cartao">
          <span>{medicamento.farmaciaMaisBarata ?? 'Menor preço'}</span>
          <span>Disponível em {medicamento.qtdFarmacias} farmácias</span>
        </div>
      </div>
    </a>
  )
}
