# Evidências da validação (16/11/2026 09:44:06)

Serviços: {'catalogo': 'ok', 'ingestao': 'ok', 'log': 'ok'}


## Compras - a mesma compra nos dois modelos (30 por modelo)
Eventos: a loja confirma e avisa o PriceHub depois. Síncrono: a loja só confirma quando o catálogo contabilizou.
- eventos: 30/30 confirmadas; espera do cliente mediana 32.76 ms, p95 51.72 ms, máximo 52.41 ms; dentro da loja, mediana 0.18 ms
- sincrono: 30/30 confirmadas; espera do cliente mediana 122.03 ms, p95 147.6 ms, máximo 148.37 ms; dentro da loja, mediana 83.31 ms
- no síncrono o cliente esperou 3.7 vezes mais (mediana)
- [x] com o catálogo no ar, os dois modelos confirmam todas as compras
- [x] as 60 vendas confirmadas foram contabilizadas pelo catálogo

### Com o consumo do ms-catalogo pausado
- eventos: 10/10 confirmadas; espera do cliente mediana 6.77 ms, máximo 48.13 ms
- sincrono: 0/10 confirmadas; espera do cliente mediana 3061.41 ms, máximo 3075.05 ms
- [x] eventos: todas as compras confirmadas com o catálogo parado
- [x] síncrono: as compras falham e são desfeitas com o catálogo parado
- [x] ao retomar, as vendas retidas na fila foram contabilizadas (nenhuma perdida)

### DrogaPopular (sem webhook: a venda vai no arquivo legado lido por polling)
- [x] pedido DP-PED-00002 confirmado em 46.42 ms e contabilizado 15.0 s depois, na próxima consulta
