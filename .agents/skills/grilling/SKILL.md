---
name: grilling
description: Entrevista o usuário com perguntas difíceis, uma de cada vez, para destrinchar um plano, requisito ou decisão de arquitetura até não restarem ambiguidades. Use quando o usuário pedir para ser questionado ("me sabatina", "grill me"), antes de implementar algo grande ou quando o pedido tiver decisões em aberto.
---

# Grilling (sabatina do plano)

Objetivo: chegar a um entendimento compartilhado e sem lacunas **antes** de escrever código ou texto.
Também serve para ensaiar a banca do TCC.

## Como conduzir

1. Ler o que já existe (README, código, `docs/`) para não perguntar o que dá para descobrir sozinho.
2. Montar mentalmente a árvore de decisões do plano: o que depende do quê.
3. Fazer **uma pergunta por vez**, começando pelas decisões das quais as outras dependem.
4. Em cada pergunta:
   - dizer por que ela importa (o que muda conforme a resposta);
   - oferecer a **sua recomendação** e as alternativas, com o custo de cada uma;
   - esperar a resposta antes da próxima.
5. Se a resposta abrir uma nova dúvida, descer nesse ramo até fechar.
6. Contestar respostas vagas ("depois a gente vê", "tanto faz") pedindo um critério concreto.
7. Parar quando todos os ramos estiverem decididos.

## O que investigar no PriceHub

- **Domínio:** o termo usado bate com o glossário? (skill `domain-modeling`)
- **Dono:** qual microsserviço é responsável? Os dados ficam em qual banco?
- **Comunicação:** é evento ou consulta? Quem produz, quem consome, o que acontece se o consumidor cair?
- **Consistência:** a farmácia precisa esperar? Quanto tempo de convergência é aceitável?
- **Falhas:** mensagem duplicada, fora de ordem, esgotou as tentativas (DLQ)?
- **Evidência:** como isso aparece no `ms-log` e no monitor? Qual print ou número entra no Capítulo 5?
- **Escopo:** isso é necessário para responder à pergunta de pesquisa do TCC ou é trabalho futuro?
- **Texto:** o que o TCC diz sobre isso hoje? Vai precisar mudar? (`docs/PENDENCIAS-OVERLEAF.txt`)

## Modo banca

Quando o usuário pedir para ensaiar a defesa, fazer perguntas como um avaliador faria:
por que RabbitMQ e não Kafka, por que microsserviços para três farmácias, o que é consistência eventual
e como foi medida, o que acontece se o RabbitMQ cair, onde está o Observer no código. Após cada resposta,
dar um retorno curto: o que ficou forte e o que faltou.

## Ao final

Entregar um resumo em tópicos: decisões tomadas, alternativas descartadas (e por quê), riscos e
próximos passos. Se for virar código, seguir com a skill `implement`.
