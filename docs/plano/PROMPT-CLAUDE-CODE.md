# Prompt para o Claude Code

Abra o Claude Code na pasta `C:\Desenvolvimento\faculdade\tcc\pricehub` e cole o bloco abaixo.

---

```text
Você vai reestruturar o PriceHub (objeto do meu TCC) de ponta a ponta: backend, farmácias, frontend, infraestrutura,
testes e documentação. A especificação completa está em docs/plano/PLANO-REESTRUTURACAO.md. Leia esse arquivo
inteiro antes de qualquer coisa, junto com README.md e AGENTS.md. Ele é a fonte da verdade. Se o código atual
contradisser o plano, siga o plano. Se o plano estiver ambíguo, decida pelo que o professor pediu (seção 1.1) e
registre a decisão.

Contexto em uma frase: o orientador disse que o sistema não refletia o documento. Ele quer três farmácias externas,
cada uma com link próprio e uma tela que altera o preço. O PriceHub capta essas alterações por eventos, compara os
preços, destaca o mais barato, mostra o histórico e leva à página do produto na farmácia. Cada microsserviço tem o
próprio banco. Nada de compra, carrinho ou vendas.

O que entregar (detalhes no plano):
- 5 serviços: ms-ingestao, ms-catalogo, ms-consulta (novo, projeção CQRS), ms-log e bff (novo, sem banco). Eles só
  se comunicam por eventos no RabbitMQ; o BFF apenas lê por HTTP.
- 4 contêineres PostgreSQL, um por serviço com banco (pg-ingestao, pg-catalogo, pg-consulta, pg-log).
- Farmácias como sistemas externos em farmacias/ (rede Docker separada, sem pricehub_common), reaproveitando os
  sites que já existem em C:\Desenvolvimento\faculdade\tcc\frontend\site1, site2-azul e site3-vermelho: sem
  carrinho, preço vindo da API da loja, página do produto por slug e uma página /admin para editar o preço e
  controlar a simulação.
- Simulação programada: script que gera 100 preços realistas por produto e por farmácia (passeio aleatório com
  semente fixa) e um agendador que aplica um preço por vez, pelo mesmo caminho da edição manual. Padrão de 5 s
  (DrogaPopular a 15 s, com polling a 5 s).
- Gateway nginx em :8080 com o roteamento por prefixo da seção 4 (/, /medicamento/{id}, /parceiras, /monitor,
  /api/*, /loja/<farmacia>/, /loja/<farmacia>/produto/<slug>, /loja/<farmacia>/admin), com SSE funcionando.
- Comparador (lista, detalhe com 3 preços, destaque do mais barato, gráfico do histórico, métricas, "Ver na
  farmácia") e monitor interno com 3 abas (Eventos, Filas e serviços, Métricas). Os apps lojas e vitrines saem.
- docs/microsservicos/*.md no roteiro da seção 12, README atualizado, script de validação com as etapas da
  seção 10 e prints novos.

Como trabalhar:
1. Comece pela fase F0: verifique o estado do git (a pasta pricehub não tem .git próprio e aparece como não
   rastreada no repositório pai). Pare e me pergunte onde versionar antes de apagar ou mover qualquer código.
   Depois, rode os testes atuais e anote a linha de base.
2. Siga as fases F1 a F8 do plano, na ordem. Use as skills do repositório: implement e tdd para cada mudança,
   domain-modeling ao criar ou renomear eventos e tabelas, frontend-sem-cara-de-ia nas telas, playwright para
   validar as telas e gerar os prints, e commit-pr para os commits.
3. Ao fim de cada fase: testes verdes (backend/executar_testes.sh, ruff check ., npm run verificar-tipos e
   npm run build), docker compose up -d --build com tudo healthy, a verificação de "pronto quando" da fase e um
   commit semântico em português com o corpo em tópicos. Sem Co-Authored-By e sem "Generated with". Não faça push
   sem eu pedir.
4. Não pare entre as fases para pedir confirmação, a menos que algo bloqueie de verdade. Pode levar o tempo que
   precisar. Se um teste falhar, investigue a causa e corrija; nunca desative um teste para passar.
5. Código, nomes, mensagens e documentação em português, seguindo o estilo do código vizinho. Preços sempre em
   centavos.
6. No final, rode o roteiro completo de validação do zero (docker compose down -v; etapa1, etapa2 subindo uma
   farmácia por vez, etapa3, simulacao --minutos 5, resiliencia) e me entregue:
   - um resumo do que mudou por fase;
   - a tabela de URLs final;
   - os números medidos (aceite, convergência, trocas da mais barata, mensagens na DLQ);
   - o passo a passo para rodar tudo;
   - o que ficou pendente ou foi decidido diferente do plano, e por quê.
```
