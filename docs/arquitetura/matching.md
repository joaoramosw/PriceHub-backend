# Matching: como saber que ofertas de fontes diferentes são o mesmo medicamento

O **catalog-service** associa cada `OfertaColetada` a um **medicamento canônico**. O MVP compara o **mesmo produto** (mesmo princípio ativo, concentração, forma e embalagem). Equivalência entre laboratórios (genérico × referência) é trabalho futuro.

Código: [`modules/matching/`](../../backend/apps/catalog-service/src/modules/matching).

## Estratégias (padrão Strategy)

Testadas em ordem; a primeira que encontrar um medicamento vence ([`strategies.ts`](../../backend/apps/catalog-service/src/modules/matching/strategies.ts)).

| Ordem | Estratégia | Critério | Confiabilidade |
|---|---|---|---|
| 1 | `RegistroMsStrategy` | registro MS normalizado (só dígitos) igual | alta: identificador oficial da Anvisa |
| 2 | `EanStrategy` | EAN (código de barras) igual | alta |
| 3 | `ChaveCanonicaStrategy` | `slug(principioNormalizado)\|concentração\|forma\|quantidade` igual | média: depende da normalização |

Exemplo de chave canônica: `losartana|50mg|comprimido-revestido|30un`, `dipirona|500mg/ml|gotas|20ml`.

## Normalização do princípio ativo

[`normalizacao.ts`](../../backend/apps/catalog-service/src/modules/matching/normalizacao.ts) + dicionário versionado [`sinonimos.ts`](../../backend/apps/catalog-service/src/modules/matching/sinonimos.ts):

1. minúsculas, sem acentos, sem pontuação, sem a dose;
2. corta o que vem depois de `/` (`"Metformina / Glifage XR"` → `metformina`);
3. remove sais e qualificadores (`cloridrato de`, `potássica`, `sódica`, `monoidratada`, `micronizada`, `microgrânulos`, `emulsão`…);
4. aplica sinônimos (`metamizol` → `dipirona`, `acetaminofeno` → `paracetamol`…).

| Entrada | Normalizado |
|---|---|
| `Cloridrato de Metformina` / `METFORMINA` | `metformina` |
| `Losartana Potássica` / `LOSARTANA POTASSICA` | `losartana` |
| `Dipirona Monoidratada` / `DIPIRONA SODICA` / `Metamizol Sódico` | `dipirona` |
| `Omeprazol Microgrânulos` / `OMEPRAZOL` | `omeprazol` |

## Regras

| Situação | Ação |
|---|---|
| Nenhuma estratégia casou e há dados mínimos | cria medicamento canônico → `catalogo.medicamento.cadastrado` |
| Casou e a oferta traz registro MS/EAN/categoria/fabricante que o medicamento não tinha | **enriquece** o medicamento → `catalogo.medicamento.atualizado` |
| Medicamento nasceu de fonte sem registro MS (DrogaPopular) e chega uma oferta com registro | troca o nome de exibição pelo da fonte oficial e marca `fonte_dos_dados = 'registro'` |
| Princípio ativo vazio após normalização, ou forma `outro` sem registro MS/EAN | grava em `ofertas_nao_correspondidas` → `catalogo.oferta.nao-correspondida` |
| Oferta antes não correspondida casa depois | é removida de `ofertas_nao_correspondidas` |

O enriquecimento resolve o caso em que **a DrogaPopular chega antes das outras**: o medicamento nasce pela chave canônica e, quando BioFarma ou FarmaAzul chegam, a `RegistroMsStrategy` ainda não acha nada (o medicamento não tem registro), a `ChaveCanonicaStrategy` casa e o registro MS é gravado no medicamento.

## Garantia sobre os dados do projeto

- [`test/unit/matching.test.ts`](../../backend/apps/catalog-service/test/unit/matching.test.ts): as 30 ofertas reais (geradas pelos adapters a partir das respostas das farmácias) formam **exatamente 10 chaves canônicas com 3 farmácias cada**, e o matching casa 100% em **qualquer ordem de chegada** (BioFarma primeiro, DrogaPopular primeiro, FarmaAzul primeiro).
- [`test/integration/catalogo.test.ts`](../../backend/apps/catalog-service/test/integration/catalogo.test.ts): ponta a ponta com Postgres e RabbitMQ reais → 10 medicamentos, 3 ofertas cada.

## Limitações conhecidas

- Concentrações em unidades diferentes (`1g` × `1000mg`) não são convertidas entre si.
- Sais diferentes do mesmo princípio ativo são tratados como equivalentes, o que é aceitável para comparar preço, mas não para prescrição.
- Associações (ex.: losartana + hidroclorotiazida) dependem de a farmácia trazer o nome completo; o dicionário não cobre combinações.
- O dicionário de sinônimos cresce manualmente; ofertas na fila de revisão indicam o que adicionar.
