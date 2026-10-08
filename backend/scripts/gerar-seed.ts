import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

type MedicamentoDoSite = {
  id: number
  slug: string
  nome: string
  dosagem: string
  apresentacao: string
  categoria: string
  preco: number
  laboratorio: string
  principioAtivo: string
  registroMS: string
}

type Embalagem = {
  quantidade: number
  unidade: 'unidade' | 'ml'
  formaFarmaAzul: string
  abreviacaoFarmaAzul: string
  abreviacaoDrogaPopular: string
}

type ProdutoDoSeed = {
  id: number
  codigo: string
  precoCentavos: number
  dados: Record<string, unknown>
}

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

const farmacias = [
  { id: 'biofarma', nome: 'BioFarma Verde', site: 'site1' },
  { id: 'farmaazul', nome: 'FarmaAzul Confiança', site: 'site2-azul' },
  { id: 'drogapopular', nome: 'DrogaPopular Express', site: 'site3-vermelho' },
] as const

function lerMedicamentos(site: string): MedicamentoDoSite[] {
  const fonte = readFileSync(path.join(raiz, 'frontend', site, 'products.js'), 'utf8')
  const inicio = fonte.indexOf('[', fonte.indexOf('const MEDICAMENTOS_DATA'))
  const fim = fonte.lastIndexOf('];')
  if (inicio < 0 || fim < inicio) throw new Error(`MEDICAMENTOS_DATA não encontrado em ${site}`)
  const literal = fonte.slice(inicio, fim + 1)
  return vm.runInNewContext(`(${literal})`, Object.create(null), { timeout: 1000 }) as MedicamentoDoSite[]
}

function semAcentos(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function interpretarEmbalagem(apresentacao: string): Embalagem {
  const texto = semAcentos(apresentacao).toLowerCase()
  const unidades = Number(texto.match(/^(\d+)\s/)?.[1])
  const mililitros = Number(texto.match(/(\d+)\s*ml/)?.[1])
  if (texto.includes('conta-gotas') && mililitros) {
    return {
      quantidade: mililitros,
      unidade: 'ml',
      formaFarmaAzul: 'solução oral em gotas',
      abreviacaoFarmaAzul: 'gts',
      abreviacaoDrogaPopular: 'GTS FR',
    }
  }
  if (!unidades) throw new Error(`apresentação não reconhecida: ${apresentacao}`)
  const porForma: [RegExp, Omit<Embalagem, 'quantidade' | 'unidade'>][] = [
    [
      /comprimidos de liberacao prolongada/,
      {
        formaFarmaAzul: 'comprimido de liberação prolongada',
        abreviacaoFarmaAzul: 'comp lib prol',
        abreviacaoDrogaPopular: 'COMP LIB PROL',
      },
    ],
    [
      /comprimidos revestidos/,
      {
        formaFarmaAzul: 'comprimido revestido',
        abreviacaoFarmaAzul: 'comp rev',
        abreviacaoDrogaPopular: 'COMP REV',
      },
    ],
    [
      /capsulas/,
      { formaFarmaAzul: 'cápsula dura', abreviacaoFarmaAzul: 'caps', abreviacaoDrogaPopular: 'CAPS' },
    ],
    [
      /comprimidos/,
      { formaFarmaAzul: 'comprimido', abreviacaoFarmaAzul: 'comp', abreviacaoDrogaPopular: 'COMP' },
    ],
  ]
  const forma = porForma.find(([padrao]) => padrao.test(texto))
  if (!forma) throw new Error(`forma não reconhecida: ${apresentacao}`)
  return { quantidade: unidades, unidade: 'unidade', ...forma[1] }
}

function principioSemDose(principioAtivo: string): string {
  return principioAtivo.replace(/\s+\d+([.,]\d+)?\s*(mg\/ml|mg|mcg|g|ml)$/i, '').trim()
}

function nomeComercialBase(nome: string): string {
  return nome
    .split('/')[0]!
    .replace(/\b(Gotas|Diário)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function primeiroLaboratorio(laboratorio: string): string {
  return laboratorio.split(' / ')[0]!.trim()
}

function sigla(nome: string): string {
  return semAcentos(nome)
    .replace(/[^A-Za-z]/g, '')
    .slice(0, 3)
    .toUpperCase()
}

function doseNumerica(dosagem: string): string {
  return dosagem.match(/^\d+/)?.[0] ?? dosagem
}

function centavos(preco: number): number {
  return Math.round(preco * 100)
}

function paraBioFarma(medicamento: MedicamentoDoSite): ProdutoDoSeed {
  const sku = `BIO-${String(medicamento.id).padStart(4, '0')}`
  return {
    id: medicamento.id,
    codigo: sku,
    precoCentavos: centavos(medicamento.preco),
    dados: {
      id: medicamento.id,
      sku,
      nome: medicamento.nome,
      dosagem: medicamento.dosagem,
      apresentacao: medicamento.apresentacao,
      principioAtivo: medicamento.principioAtivo,
      laboratorio: medicamento.laboratorio,
      registroMS: medicamento.registroMS,
      categoria: medicamento.categoria,
    },
  }
}

function paraFarmaAzul(medicamento: MedicamentoDoSite): ProdutoDoSeed {
  const embalagem = interpretarEmbalagem(medicamento.apresentacao)
  const codigo = `FA-${sigla(medicamento.nome)}-${doseNumerica(medicamento.dosagem)}`
  const principio = principioSemDose(medicamento.principioAtivo)
  const quantidadeTexto =
    embalagem.unidade === 'ml'
      ? `${embalagem.abreviacaoFarmaAzul} ${embalagem.quantidade}ml`
      : `${embalagem.quantidade} ${embalagem.abreviacaoFarmaAzul}`
  return {
    id: medicamento.id,
    codigo,
    precoCentavos: centavos(medicamento.preco),
    dados: {
      codigo,
      descricao: `${principio} ${medicamento.dosagem} ${quantidadeTexto}`,
      principio_ativo: principio,
      concentracao: medicamento.dosagem,
      forma_farmaceutica: embalagem.formaFarmaAzul,
      quantidade_embalagem: embalagem.quantidade,
      fabricante: primeiroLaboratorio(medicamento.laboratorio),
      registro_anvisa: medicamento.registroMS.replace(/\D/g, ''),
    },
  }
}

function paraDrogaPopular(medicamento: MedicamentoDoSite): ProdutoDoSeed {
  const embalagem = interpretarEmbalagem(medicamento.apresentacao)
  const cod = `DP-${String(medicamento.id).padStart(4, '0')}`
  const nome = semAcentos(nomeComercialBase(medicamento.nome)).toUpperCase()
  const dose = medicamento.dosagem.toUpperCase()
  const descricao =
    embalagem.unidade === 'ml'
      ? `${nome} ${dose} ${embalagem.abreviacaoDrogaPopular} ${embalagem.quantidade}ML`
      : `${nome} ${dose} C/${embalagem.quantidade} ${embalagem.abreviacaoDrogaPopular}`
  return {
    id: medicamento.id,
    codigo: cod,
    precoCentavos: centavos(medicamento.preco),
    dados: {
      COD: cod,
      DESCRICAO: descricao,
      LAB: semAcentos(primeiroLaboratorio(medicamento.laboratorio)).toUpperCase(),
    },
  }
}

const conversores = { biofarma: paraBioFarma, farmaazul: paraFarmaAzul, drogapopular: paraDrogaPopular }

for (const farmacia of farmacias) {
  const medicamentos = lerMedicamentos(farmacia.site)
  const produtos = medicamentos.map(conversores[farmacia.id])
  const destino = path.join(raiz, 'backend', 'apps', 'farmacia-sim', 'seed', `${farmacia.id}.json`)
  writeFileSync(
    destino,
    `${JSON.stringify({ farmaciaId: farmacia.id, farmaciaNome: farmacia.nome, produtos }, null, 2)}\n`,
  )
  console.log(`${farmacia.id}: ${produtos.length} produtos → ${path.relative(raiz, destino)}`)
}
