---
name: domain-modeling
description: Modelagem de domínio do PriceHub (linguagem ubíqua, contextos delimitados por microsserviço, entidades, eventos de domínio e invariantes). Use ao criar ou renomear conceitos, entidades, tabelas ou eventos, ao discutir regras de negócio ou quando um termo estiver ambíguo.
---

# Modelagem de domínio

O PriceHub segue a ideia de Domain-Driven Design: cada microsserviço é um **contexto delimitado** com a
própria linguagem e o próprio banco. O código usa os termos do domínio **em português**.

## Contextos delimitados

| Contexto | Serviço | Responsabilidade | Banco |
|---|---|---|---|
| Farmácia (externo) | `ms-farmacia` | catálogo próprio de cada farmácia, em memória; avisa alterações (Observer) | - |
| Ingestão | `ms-ingestao` | receber webhooks, consultar por polling, adaptar formatos ao modelo canônico | `ingestao` |
| Catálogo | `ms-catalogo` | medicamento único, ofertas, preço atual, histórico, busca | `catalogo` |
| Auditoria | `ms-log` | registro de todos os eventos, rastreamento, métricas | `auditoria` |

Os contextos só se integram por **eventos** (linguagem publicada no envelope). Um contexto não usa as
entidades internas de outro.

## Glossário (linguagem ubíqua)

| Termo | Significado | Onde vive |
|---|---|---|
| Farmácia | Fonte externa de preços (BioFarma Verde, FarmaAzul Confiança, DrogaPopular Express) | todos |
| Produto | Item no catálogo da farmácia, no formato dela | ms-farmacia |
| Coleta | Recebimento de dados de uma farmácia (webhook, polling ou sincronização) | ms-ingestao |
| Coleta bruta | O que chegou da farmácia, guardado como veio | ms-ingestao |
| Oferta canônica | Produto convertido para o modelo comum, preço em centavos | ms-ingestao → ms-catalogo |
| Item descartado | Item que não pôde ser adaptado (dados inválidos) | ms-ingestao |
| Medicamento | Identidade única de um remédio (princípio ativo, concentração, forma, quantidade) | ms-catalogo |
| Oferta | Preço de um medicamento em uma farmácia, com disponibilidade | ms-catalogo |
| Histórico de preços | Sequência de preços de uma oferta, só acrescentada | ms-catalogo |
| Correspondência | Associação de uma oferta canônica a um medicamento (Strategy) | ms-catalogo |
| Oferta não correspondida | Oferta que nenhuma estratégia associou | ms-catalogo |
| Registro de evento | Cópia de cada evento para rastreamento | ms-log |
| correlationId | Identificador de uma operação do início ao fim | envelope |
| Tempo de aceite | Quanto a farmácia esperou pela resposta do ms-ingestao | ms-log |
| Janela de convergência | Do primeiro evento da operação até o catálogo atualizado | ms-log |

## Invariantes

- Preço é sempre **inteiro em centavos**.
- Um par (farmácia, código externo) tem no máximo **uma** oferta.
- O histórico de preços só recebe novas linhas; nunca é editado.
- Uma oferta mais antiga que a já registrada não sobrescreve o preço.
- Oferta removida ou ausente numa coleta completa fica **indisponível**, mas o histórico é mantido.
- O mesmo evento (`idDoEvento`) é aplicado uma vez só.

## Eventos de domínio

- Nome no **particípio passado**, no formato `<contexto>.<entidade>.<fato>`:
  `ingestao.oferta.recebida`, `catalogo.oferta.atualizada`.
- Contrato em `backend/libs/pricehub_common/pricehub_common/eventos/contratos.py`.
- Mudança incompatível no `dados` → subir `versao` do envelope.

## Ao modelar algo novo

1. Perguntar a qual contexto o conceito pertence. Se parecer pertencer a dois, provavelmente são dois
   conceitos com o mesmo nome; dar nomes diferentes.
2. Definir o termo em uma frase e acrescentar ao glossário acima (e a esta skill na pasta `.agents/skills`).
3. Listar as invariantes e transformá-las em testes (skill `tdd`).
4. Se outro contexto precisa saber da mudança, definir o evento (nome, produtor, consumidores, dados).
5. Atualizar a tabela de eventos do README e, se afetar o TCC, `docs/PENDENCIAS-OVERLEAF.txt`.
6. Em dúvida de termo ou fronteira, usar a skill `grilling`.
