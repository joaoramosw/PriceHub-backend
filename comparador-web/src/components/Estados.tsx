type Props = { mensagem?: string; tentarNovamente?: () => void }

export function Esqueletos() {
  return (
    <div className="grade" role="status">
      <span className="sr-only">Carregando medicamentos</span>
      {'um dois três quatro cinco seis'.split(' ').map((chave) => (
        <div className="esqueleto" key={chave} aria-hidden="true" />
      ))}
    </div>
  )
}

export function Erro({ mensagem, tentarNovamente }: Props) {
  return (
    <div className="estado" role="alert">
      <p>{mensagem ?? 'Ocorreu um erro.'}</p>
      <button
        type="button"
        className="botao secundario"
        onClick={tentarNovamente}
      >
        Tentar novamente
      </button>
    </div>
  )
}

export function Vazio() {
  return (
    <div className="estado">
      <span className="estado-icone" aria-hidden="true">
        ⌕
      </span>
      <p>Nenhum medicamento encontrado.</p>
      <span>Tente outro nome ou princípio ativo.</span>
    </div>
  )
}
