# Evidências da validação (16/11/2026 21:01:48)

Serviços: {'catalogo': 'ok', 'ingestao': 'ok', 'log': 'ok'}


## Etapa 3 - Alteração de preço propagada por eventos

| Farmácia | Produto | Integração | Eventos | Do 1º evento ao catálogo |
|---|---|---|---|---|
| biofarma | BIO-0002 | webhook-agendado | ingestao.oferta.recebida → ingestao.coleta.realizada → catalogo.oferta.atualizada | 13.83 ms |
| farmaazul | FA-LOS-50 | webhook-agendado | ingestao.oferta.recebida → ingestao.coleta.realizada → catalogo.oferta.atualizada | 19.41 ms |
| drogapopular | DP-0002 | aguardando-polling | ingestao.oferta.recebida → ingestao.coleta.realizada → catalogo.oferta.atualizada | 12.76 ms |
- [x] as 3 alterações chegaram ao catálogo e foram rastreadas pelo correlationId

## Resiliência - ms-catalogo fora do ar (consumo pausado)
- farmácia atendida normalmente: mediana de 48.6 ms por alteração
- [x] 20 mensagens retidas na fila ms-catalogo.eventos-de-ingestao enquanto o consumidor estava parado
- [x] consumo retomado: a fila foi processada e todas as alterações chegaram ao catálogo

## Rajada - 40 alterações simultâneas nas farmácias com webhook
- resposta da farmácia ao painel: mediana 171.2 ms, máximo 300.0 ms
- aceite: mediana 37.14 ms, p95 61.14 ms, máximo 68.47 ms (40 amostras)
- convergencia: mediana 342.52 ms, p95 558.53 ms, máximo 582.73 ms (40 amostras)
- equivalenteSincrono: mediana 386.32 ms, p95 589.77 ms, máximo 611.93 ms (40 amostras)

## Simulação programada - reajustes automáticos das lojas chegam ao catálogo

| Farmácia | Produto | De | Para | Chegou ao catálogo em |
|---|---|---|---|---|
| biofarma | Nimesulida | R$ 15.20 | R$ 15.69 | até 0.0 s |
| farmaazul | Nimesulida 100mg | R$ 10.35 | R$ 13.09 | até 0.0 s |
| drogapopular | Dipirona Sódica | R$ 5.99 | R$ 5.89 | até 3.1 s |
- [x] um reajuste programado de cada farmácia chegou ao catálogo (webhook e polling)
