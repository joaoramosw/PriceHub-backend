/**
 * Liga o site da farmácia à API da própria loja (/gestao/produtos).
 *
 * Os dados descritivos (bula, imagens) continuam em products.js; o preço vem da
 * memória da loja e muda ao vivo, seja pela tela /admin, seja pela simulação
 * programada. O carrinho dos sites originais foi removido: o PriceHub é um
 * comparador de preços, não uma loja.
 */
(function () {
  'use strict';

  // O carrinho foi removido; estas funções dos sites originais viram "não faz nada".
  ['updateCartUI', 'toggleCart', 'closeCheckoutModal', 'closeSuccessModal', 'animateBadge'].forEach(function (nome) {
    window[nome] = function () {};
  });

  var produtos = typeof MEDICAMENTOS_DATA !== 'undefined' ? MEDICAMENTOS_DATA : [];
  var ultimaAtualizacao = null;

  function aplicar(lista) {
    var mudancas = [];
    lista.forEach(function (doServidor) {
      var local = produtos.find(function (p) { return p.id === doServidor.id; });
      if (!local) return;
      var preco = doServidor.precoCentavos / 100;
      if (local.codigo && local.preco !== preco) {
        mudancas.push({ nome: local.nome, de: local.preco, para: preco });
      }
      local.preco = preco;
      local.codigo = doServidor.codigo;
    });
    ultimaAtualizacao = new Date();
    return mudancas;
  }

  // Primeira leitura síncrona: a página já abre com o preço atual e sabe qual é o produto da URL.
  try {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'gestao/produtos', false);
    xhr.send();
    if (xhr.status === 200) aplicar(JSON.parse(xhr.responseText));
  } catch (erro) { /* segue com os preços de products.js */ }

  // URL amigável usada pelo PriceHub: /produto/{codigo}. A página original lê ?id=N.
  var rota = location.pathname.match(/\/produto\/([^/]+)\/?$/);
  if (rota) {
    var codigo = decodeURIComponent(rota[1]).toUpperCase();
    var produto = produtos.find(function (p) { return (p.codigo || '').toUpperCase() === codigo; });
    if (produto) history.replaceState(null, '', location.pathname + '?id=' + produto.id);
  }

  function formatar(valor) {
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function rerenderizar() {
    if (typeof filterAndRenderProducts === 'function') filterAndRenderProducts();
    if (typeof renderProductPage === 'function' && typeof currentProduct !== 'undefined' && currentProduct) {
      renderProductPage(currentProduct);
    }
  }

  function avisar(mudancas) {
    var caixa = document.getElementById('loja-avisos');
    mudancas.slice(0, 3).forEach(function (m) {
      var item = document.createElement('div');
      item.className = 'loja-aviso';
      item.textContent = m.nome + ': ' + formatar(m.de) + ' → ' + formatar(m.para);
      caixa.appendChild(item);
      setTimeout(function () { item.remove(); }, 4000);
    });
  }

  function montarBarra() {
    var estilo = document.createElement('style');
    estilo.textContent =
      '#loja-barra{position:fixed;left:12px;bottom:12px;z-index:60;display:flex;gap:10px;align-items:center;' +
      'background:#0f172a;color:#e2e8f0;font:600 12px system-ui,sans-serif;padding:8px 12px;border-radius:10px;' +
      'box-shadow:0 4px 14px rgba(0,0,0,.25)}#loja-barra a{color:#fff;text-decoration:underline}' +
      '#loja-barra .ponto{width:8px;height:8px;border-radius:50%;background:#22c55e}' +
      '#loja-avisos{position:fixed;left:12px;bottom:56px;z-index:60;display:flex;flex-direction:column;gap:6px}' +
      '.loja-aviso{background:#fff;color:#0f172a;border:1px solid #cbd5e1;border-radius:8px;padding:6px 10px;' +
      'font:500 12px system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.12)}';
    document.head.appendChild(estilo);
    var barra = document.createElement('div');
    barra.id = 'loja-barra';
    barra.innerHTML = '<span class="ponto"></span><span id="loja-hora">Preços ao vivo</span><a href="admin">Alterar preços</a>';
    document.body.appendChild(barra);
    var avisos = document.createElement('div');
    avisos.id = 'loja-avisos';
    document.body.appendChild(avisos);
  }

  function atualizarHora() {
    var hora = document.getElementById('loja-hora');
    if (hora && ultimaAtualizacao) hora.textContent = 'Preços ao vivo · ' + ultimaAtualizacao.toLocaleTimeString('pt-BR');
  }

  function consultar() {
    fetch('gestao/produtos', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (lista) {
        var mudancas = aplicar(lista);
        if (mudancas.length) { rerenderizar(); avisar(mudancas); }
        atualizarHora();
      })
      .catch(function () { /* loja fora do ar: tenta de novo no próximo ciclo */ });
  }

  document.addEventListener('DOMContentLoaded', function () {
    montarBarra();
    atualizarHora();
    setInterval(consultar, 3000);
  });
})();
