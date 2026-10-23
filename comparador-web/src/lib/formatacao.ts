const moeda = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

export function formatarBRL(centavos: number | null): string {
  if (centavos === null) return 'Preço indisponível'
  return moeda
    .formatToParts(Math.floor(centavos / 100))
    .map((parte) =>
      parte.type === 'fraction'
        ? String(centavos % 100).padStart(2, '0')
        : parte.value,
    )
    .join('')
}

export function mapearImagem(imagem: string | null): string | null {
  if (!imagem) return null
  const nome = imagem.split('/').at(-1)
  return nome ? `/medicamentos/${encodeURIComponent(nome)}` : null
}

export function formatarData(data: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(data))
}
