# Evidências da validação (11/11/2026 22:33:16)

Serviços: {'catalogo': 'ok', 'ingestao': 'ok', 'log': 'ok'}


## Etapa 3 - Alteração de preço propagada por eventos

| Farmácia | Produto | Integração | Eventos | Do 1º evento ao catálogo |
|---|---|---|---|---|
| biofarma | BIO-0002 | webhook-agendado | ingestao.oferta.recebida → ingestao.coleta.realizada → catalogo.oferta.atualizada | 12.53 ms |
| farmaazul | FA-LOS-50 | webhook-agendado | ingestao.oferta.recebida → ingestao.coleta.realizada → catalogo.oferta.atualizada | 16.25 ms |
| drogapopular | DP-0002 | aguardando-polling | ingestao.oferta.recebida → ingestao.coleta.realizada → catalogo.oferta.atualizada | 13.31 ms |
- [x] as 3 alterações chegaram ao catálogo e foram rastreadas pelo correlationId

## Resiliência - ms-catalogo fora do ar (consumo pausado)
- farmácia atendida normalmente: mediana de 3.6 ms por alteração
- [x] 20 mensagens retidas na fila ms-catalogo.eventos-de-ingestao enquanto o consumidor estava parado
- [x] consumo retomado: a fila foi processada e todas as alterações chegaram ao catálogo

## Rajada - 40 alterações simultâneas nas farmácias com webhook
- resposta da farmácia ao painel: mediana 106.7 ms, máximo 189.0 ms
- aceite: mediana 31.98 ms, p95 162.77 ms, máximo 195.31 ms (66 amostras)
- convergencia: mediana 215.05 ms, p95 9498.61 ms, máximo 9518.37 ms (66 amostras)
- equivalenteSincrono: mediana 263.31 ms, p95 9533.73 ms, máximo 9560.93 ms (66 amostras)
