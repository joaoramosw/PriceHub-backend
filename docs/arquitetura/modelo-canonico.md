# Modelo canônico e padronização

Toda oferta que entra no PriceHub é convertida, no **ingestion-service**, para o modelo canônico `OfertaColetada` ([`oferta-coletada.ts`](../../backend/packages/contracts/src/oferta-coletada.ts)). Depois desse ponto, nenhum serviço conhece o formato de nenhuma farmácia.

## `OfertaColetada`

```ts
{
  farmaciaId: string                 // 'biofarma' | 'farmaazul' | 'drogapopular'
  farmaciaNome: string
  externalId: string                 // id da oferta na farmácia (sku, codigo, COD)
  nome: string                       // nome como a farmácia exibe
  principioAtivo: string             // sem a dose
  concentracao: { valor: number, unidade: 'mg' | 'mg/ml' | 'g' | 'ml' | 'mcg' }
  forma: 'comprimido' | 'comprimido revestido' | 'comprimido liberacao prolongada' | 'capsula' | 'gotas' | 'suspensao' | 'outro'
  quantidade: { valor: number, unidade: 'unidade' | 'ml' }
  fabricante: string | null
  registroMs: string | null          // somente dígitos (9 a 13)
  ean: string | null
  categoria: string | null
  precoCentavos: number              // inteiro
  atualizadoNaOrigemEm: string | null
  coletadoEm: string
}
```

O schema é estrito (`additionalProperties: false`): preço fracionado, unidade desconhecida, registro com máscara ou campo extra são rejeitados.

## Regras de normalização (adapters)

Implementadas em [`connectors/normalizacao.ts`](../../backend/apps/ingestion-service/src/connectors/normalizacao.ts) e aplicadas por cada adapter.

| Dado | Regra | Exemplos |
|---|---|---|
| Preço | sempre **centavos inteiros**; a conversão acontece só no adapter | `11.50` → `1150`; `"7,49"` → `749`; `"1.234,56"` → `123456`; `890` → `890` |
| Registro MS | só dígitos; vazio ou fora de 9–13 dígitos → `null` | `"MS 1.0181.0421.002-3"` → `"1018104210023"` |
| Concentração | regex `número + (mg/ml \| mcg \| mg \| g \| ml)`, vírgula decimal aceita | `"500MG/ML"` → `{500, 'mg/ml'}`; `"2,5 mg"` → `{2.5, 'mg'}` |
| Forma | vocabulário próprio → enumeração canônica (sem acento, minúsculas) | `"COMP REV"`, `"comprimidos revestidos"` → `comprimido revestido`; `"COMP LIB PROL"`, `"comprimido de liberação prolongada"` → `comprimido liberacao prolongada`; `"cápsula dura"`, `"CAPS"` → `capsula`; `"solução oral em gotas"`, `"GTS"`, `"conta-gotas"` → `gotas`; desconhecida → `outro` |
| Quantidade | `gotas`/`suspensao` → mililitros; demais → unidades | `"30 comprimidos"` → `{30, 'unidade'}`; `"Frasco conta-gotas 20ml"` → `{20, 'ml'}`; `"C/28 CAPS"` → `{28, 'unidade'}` |
| Princípio ativo | remove a dose do final | `"Cloridrato de Metformina 500mg"` → `"Cloridrato de Metformina"` |
| Datas | ISO 8601 UTC; data brasileira assume `-03:00` | `"08/10/2026 10:30"` → `"2026-10-08T13:30:00.000Z"` |

### Parser da DrogaPopular

A DrogaPopular manda tudo numa string: `LOSARTANA POTASSICA 50MG C/30 COMP REV`. O [`descricao-parser.ts`](../../backend/apps/ingestion-service/src/connectors/drogapopular/descricao-parser.ts) separa:

```
^(nome)  (dose: número + unidade)  (resto: quantidade e forma)$
 LOSARTANA POTASSICA | 50MG | C/30 COMP REV
```

## Validação em duas camadas

1. **Contrato externo** (anti-corruption layer): cada adapter valida a resposta da farmácia contra o schema TypeBox **daquela farmácia**. Payload fora do formato → `PayloadInvalidoError` (webhook responde 400; sync falha e é registrado).
2. **Modelo canônico:** cada item convertido é validado contra `OfertaColetada`. Item que não fecha (ex.: descrição sem concentração) é **descartado com motivo** no log; os demais seguem. A coleta bruta fica guardada em `coletas_brutas` para auditoria.

A decisão sobre **qual medicamento** a oferta representa não é do ingestion: é do catalog ([matching](matching.md)).
