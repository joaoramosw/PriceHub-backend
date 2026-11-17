# Evidências da validação (16/11/2026 20:34:43)

Serviços: {'catalogo': 'ok', 'ingestao': 'ok', 'log': 'ok'}


## Etapa 3 - Alteração de preço propagada por eventos

| Farmácia | Produto | Integração | Eventos | Do 1º evento ao catálogo |
|---|---|---|---|---|
| biofarma | BIO-0002 | webhook-agendado | ingestao.oferta.recebida → ingestao.coleta.realizada → catalogo.oferta.atualizada | 10.1 ms |
| farmaazul | FA-LOS-50 | webhook-agendado | ingestao.oferta.recebida → ingestao.coleta.realizada → catalogo.oferta.atualizada | 9.63 ms |
| drogapopular | DP-0002 | aguardando-polling | ingestao.oferta.recebida → ingestao.coleta.realizada → catalogo.oferta.atualizada | 9.73 ms |
- [x] as 3 alterações chegaram ao catálogo e foram rastreadas pelo correlationId

## Resiliência - ms-catalogo fora do ar (consumo pausado)
- farmácia atendida normalmente: mediana de 47.8 ms por alteração
- [x] 1 mensagens retidas na fila ms-catalogo.eventos-de-ingestao enquanto o consumidor estava parado
- [x] consumo retomado: a fila foi processada e todas as alterações chegaram ao catálogo

## Rajada - 40 alterações simultâneas nas farmácias com webhook
- resposta da farmácia ao painel: mediana 145.4 ms, máximo 256.2 ms
- aceite: mediana 32.3 ms, p95 46.73 ms, máximo 53.47 ms (40 amostras)
- convergencia: mediana 280.95 ms, p95 465.47 ms, máximo 516.3 ms (40 amostras)
- equivalenteSincrono: mediana 325.63 ms, p95 491.42 ms, máximo 546.21 ms (40 amostras)

## Simulação programada - reajustes automáticos das lojas chegam ao catálogo

| Farmácia | Produto | De | Para | Chegou ao catálogo em |
|---|---|---|---|---|
| biofarma | Omeprazol | R$ 19.89 | R$ 20.09 | até 0.0 s |
| farmaazul | Hidroclorotiazida 25mg | R$ 4.54 | R$ 4.29 | até 0.0 s |
| drogapopular | Tadalafila | R$ 31.09 | R$ 32.29 | até 2.6 s |
- [x] um reajuste programado de cada farmácia chegou ao catálogo (webhook e polling)
