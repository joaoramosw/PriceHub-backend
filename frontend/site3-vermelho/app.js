/**
 * DrogaPopular Express - Lógica da Vitrine Farmacêutica Popular / Desconto
 */

const state = {
  products: typeof MEDICAMENTOS_DATA !== 'undefined' ? MEDICAMENTOS_DATA : [],
  filteredProducts: [],
  cart: JSON.parse(localStorage.getItem('drogapopular_cart') || '[]'),
  searchTerm: '',
  selectedCategory: 'Todos',
  selectedTarja: 'Todos',
  sortBy: 'populares',
  appliedCoupon: null,
  shippingCost: null,
  shippingCep: ''
};

function formatCurrency(value) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

document.addEventListener('DOMContentLoaded', () => {
  initCategories();
  filterAndRenderProducts();
  updateCartUI();
  setupEventListeners();
});

function initCategories() {
  const categoryContainer = document.getElementById('category-filters');
  if (!categoryContainer) return;

  const categories = ['Todos', ...new Set(state.products.map(p => p.categoria))];
  
  categoryContainer.innerHTML = categories.map(cat => {
    const isSelected = cat === state.selectedCategory;
    return `
      <button 
        type="button" 
        data-category="${cat}"
        class="category-btn shrink-0 px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
          isSelected 
            ? 'bg-rose-700 text-white border-rose-700 shadow-sm' 
            : 'bg-white text-slate-700 border-slate-300 hover:border-rose-400 hover:bg-rose-50/50'
        }"
      >
        ${cat === 'Todos' ? '🔥 Todos os Remédios' : cat}
      </button>
    `;
  }).join('');
}

function filterAndRenderProducts() {
  let list = [...state.products];

  if (state.searchTerm.trim() !== '') {
    const term = state.searchTerm.toLowerCase().trim();
    list = list.filter(p => 
      p.nome.toLowerCase().includes(term) ||
      p.descricao.toLowerCase().includes(term) ||
      p.principioAtivo.toLowerCase().includes(term) ||
      p.categoria.toLowerCase().includes(term) ||
      p.indicacao.toLowerCase().includes(term)
    );
  }

  if (state.selectedCategory !== 'Todos') {
    list = list.filter(p => p.categoria === state.selectedCategory);
  }

  if (state.selectedTarja === 'livre') {
    list = list.filter(p => p.tarjaTipo === 'livre');
  } else if (state.selectedTarja === 'vermelha') {
    list = list.filter(p => p.tarjaTipo === 'vermelha');
  }

  if (state.sortBy === 'preco-asc') {
    list.sort((a, b) => a.preco - b.preco);
  } else if (state.sortBy === 'preco-desc') {
    list.sort((a, b) => b.preco - a.preco);
  } else if (state.sortBy === 'nome-asc') {
    list.sort((a, b) => a.nome.localeCompare(b.nome));
  } else if (state.sortBy === 'populares') {
    list.sort((a, b) => b.avaliacoesTotal - a.avaliacoesTotal);
  }

  state.filteredProducts = list;
  renderProductGrid(list);

  const countEl = document.getElementById('results-count');
  if (countEl) {
    countEl.textContent = `${list.length} ${list.length === 1 ? 'oferta ativa' : 'ofertas ativas com preço baixo'}`;
  }
}

// Cards no estilo Hipermercado Farma / Desconto Agressivo
function renderProductGrid(products) {
  const grid = document.getElementById('products-grid');
  const emptyState = document.getElementById('empty-state');
  if (!grid) return;

  if (products.length === 0) {
    grid.innerHTML = '';
    if (emptyState) emptyState.classList.remove('hidden');
    return;
  }

  if (emptyState) emptyState.classList.add('hidden');

  grid.innerHTML = products.map(item => {
    const isVermelha = item.tarjaTipo === 'vermelha';
    const precoOriginal = (item.preco * 1.55).toFixed(2);
    const economia = (precoOriginal - item.preco).toFixed(2);
    const productUrl = `produto.html?id=${item.id}`;

    return `
      <article class="card-hover-effect flex flex-col h-full bg-white rounded-2xl border-2 border-rose-100 overflow-hidden shadow-xs hover:border-rose-400 hover:shadow-lg transition-all relative">
        
        <!-- Selo de Economia no Canto -->
        <div class="absolute top-0 right-0 z-10 bg-amber-400 text-amber-950 font-black text-[10px] px-2.5 py-1 rounded-bl-xl shadow-xs uppercase tracking-wider">
          Economize R$ ${economia.replace('.', ',')}
        </div>

        <!-- Imagem com Altura Fixa de 208px (h-52) com packshot nítido -->
        <a href="${productUrl}" class="block relative w-full h-52 bg-slate-50 overflow-hidden group shrink-0 flex items-center justify-center p-3" title="Ver oferta de ${item.nome}">
          <img 
            src="${item.imagem}" 
            alt="${item.nome}"
            loading="lazy"
            class="w-full h-full object-contain object-center group-hover:scale-105 transition-transform duration-300"
            onerror="this.src='images/metformina.jpg'"
          />

          <div class="absolute top-3 left-3">
            ${isVermelha 
              ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black bg-rose-700 text-white shadow-xs">
                   TARJA VERMELHA
                 </span>`
              : `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black bg-emerald-600 text-white shadow-xs">
                   VENDA LIVRE
                 </span>`
            }
          </div>

          <span class="absolute bottom-3 left-3 bg-slate-900/90 text-white text-[10px] font-bold px-2 py-0.5 rounded">
            ${item.categoria}
          </span>
        </a>

        <!-- Conteúdo Foco em Preço e Promoção -->
        <div class="p-4 sm:p-5 flex-1 flex flex-col justify-between">
          <div>
            <div class="flex items-center justify-between mb-1 text-xs">
              <span class="text-slate-400 font-bold uppercase text-[10px]">${item.laboratorio}</span>
              <span class="text-amber-500 font-extrabold text-xs">★ ${item.avaliacao}</span>
            </div>

            <h3 class="text-base font-black text-slate-900 mb-0.5 leading-snug">
              <a href="${productUrl}" class="hover:text-rose-700 transition-colors line-clamp-1" title="${item.nome}">
                ${item.nome} <span class="text-xs font-semibold text-slate-500">(${item.dosagem})</span>
              </a>
            </h3>

            <p class="text-xs text-slate-500 font-semibold mb-3 truncate">
              ${item.apresentacao}
            </p>
          </div>

          <!-- Bloco de Preço Strike-through e Botão Chamativo -->
          <div class="pt-3 border-t border-slate-100 mt-auto space-y-3">
            <div class="bg-rose-50/60 p-2.5 rounded-xl border border-rose-100">
              <span class="text-[11px] text-slate-400 line-through block leading-none">
                De R$ ${precoOriginal.replace('.', ',')}
              </span>
              <div class="flex items-baseline justify-between mt-1">
                <div>
                  <span class="text-[10px] font-black text-rose-600 uppercase tracking-wider block">Por apenas</span>
                  <span class="text-2xl sm:text-3xl font-black text-rose-700 leading-none">
                    ${formatCurrency(item.preco)}
                  </span>
                </div>
                <span class="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                  Menor Preço
                </span>
              </div>
            </div>

            <div class="grid grid-cols-5 gap-2">
              <a 
                href="${productUrl}"
                class="col-span-2 px-2.5 py-2.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors text-center flex items-center justify-center"
              >
                Detalhes
              </a>
              <button 
                type="button" 
                onclick="quickAddToCart(${item.id})"
                class="col-span-3 px-3 py-2.5 text-xs font-black text-white bg-rose-600 hover:bg-rose-700 active:scale-[0.98] rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5"
              >
                <span>COMPRAR</span>
              </button>
            </div>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

function quickAddToCart(productId) {
  addToCart(productId, 1);
}

function addToCart(productId, quantity = 1) {
  const product = state.products.find(p => p.id === productId);
  if (!product) return;

  const existingIndex = state.cart.findIndex(item => item.id === productId);
  if (existingIndex > -1) {
    state.cart[existingIndex].quantity += quantity;
  } else {
    state.cart.push({
      id: product.id,
      nome: product.nome,
      dosagem: product.dosagem,
      preco: product.preco,
      imagem: product.imagem,
      tarjaTipo: product.tarjaTipo,
      quantity: quantity
    });
  }

  saveCart();
  updateCartUI();
  showToast(`✓ ${product.nome} adicionado na Cesta DrogaPopular!`);
  animateBadge();
}

function removeFromCart(productId) {
  state.cart = state.cart.filter(item => item.id !== productId);
  saveCart();
  updateCartUI();
  showToast('Item removido da cesta.', 'info');
}

function updateCartItemQuantity(productId, delta) {
  const item = state.cart.find(i => i.id === productId);
  if (!item) return;

  item.quantity += delta;
  if (item.quantity <= 0) {
    removeFromCart(productId);
    return;
  }

  saveCart();
  updateCartUI();
}

function saveCart() {
  localStorage.setItem('drogapopular_cart', JSON.stringify(state.cart));
}

function updateCartUI() {
  const totalItems = state.cart.reduce((acc, item) => acc + item.quantity, 0);
  const subtotal = state.cart.reduce((acc, item) => acc + (item.preco * item.quantity), 0);

  const badge = document.getElementById('cart-badge');
  const badgeHeaderTotal = document.getElementById('cart-header-total');
  if (badge) {
    badge.textContent = totalItems;
    badge.classList.toggle('hidden', totalItems === 0);
  }
  if (badgeHeaderTotal) {
    badgeHeaderTotal.textContent = formatCurrency(subtotal);
  }

  const itemsContainer = document.getElementById('cart-items-container');
  const emptyCartState = document.getElementById('cart-empty-state');
  const cartSummary = document.getElementById('cart-summary-section');

  if (itemsContainer) {
    if (state.cart.length === 0) {
      itemsContainer.innerHTML = '';
      if (emptyCartState) emptyCartState.classList.remove('hidden');
      if (cartSummary) cartSummary.classList.add('hidden');
    } else {
      if (emptyCartState) emptyCartState.classList.add('hidden');
      if (cartSummary) cartSummary.classList.remove('hidden');

      itemsContainer.innerHTML = state.cart.map(item => `
        <div class="flex items-center gap-3 p-3 bg-white rounded-xl border border-rose-100">
          <img src="${item.imagem}" alt="${item.nome}" class="w-14 h-14 rounded-lg object-cover bg-slate-100 border border-slate-200 shrink-0" />
          <div class="flex-1 min-w-0">
            <h4 class="text-xs sm:text-sm font-bold text-slate-800 truncate">${item.nome} <span class="font-normal text-slate-500">${item.dosagem}</span></h4>
            <div class="text-xs font-black text-rose-700">${formatCurrency(item.preco)}</div>
            <div class="flex items-center gap-2 mt-2">
              <div class="flex items-center border border-slate-200 rounded-lg bg-slate-50">
                <button type="button" onclick="updateCartItemQuantity(${item.id}, -1)" class="w-6 h-6 flex items-center justify-center text-slate-600 hover:bg-slate-200 font-bold text-xs">−</button>
                <span class="w-6 text-center text-xs font-bold text-slate-800">${item.quantity}</span>
                <button type="button" onclick="updateCartItemQuantity(${item.id}, 1)" class="w-6 h-6 flex items-center justify-center text-slate-600 hover:bg-slate-200 font-bold text-xs">+</button>
              </div>
              <button type="button" onclick="removeFromCart(${item.id})" class="text-slate-400 hover:text-rose-600 p-1 text-xs">
                ✕
              </button>
            </div>
          </div>
          <div class="text-right">
            <span class="text-xs font-extrabold text-slate-900 block">${formatCurrency(item.preco * item.quantity)}</span>
          </div>
        </div>
      `).join('');
    }
  }

  const finalShipping = state.shippingCost !== null ? (subtotal >= 99 ? 0 : state.shippingCost) : 0;
  const grandTotal = subtotal + finalShipping;

  const subtotalEl = document.getElementById('cart-subtotal');
  const shippingEl = document.getElementById('cart-shipping');
  const totalEl = document.getElementById('cart-grand-total');

  if (subtotalEl) subtotalEl.textContent = formatCurrency(subtotal);
  if (shippingEl) {
    if (state.shippingCost === null) {
      shippingEl.textContent = 'Calcule acima';
    } else if (finalShipping === 0) {
      shippingEl.textContent = 'GRÁTIS';
      shippingEl.className = 'text-xs font-bold text-emerald-600';
    } else {
      shippingEl.textContent = formatCurrency(finalShipping);
    }
  }
  if (totalEl) totalEl.textContent = formatCurrency(grandTotal);
}

function toggleCart(show) {
  const drawer = document.getElementById('cart-drawer');
  const backdrop = document.getElementById('cart-backdrop');
  if (!drawer || !backdrop) return;

  if (show) {
    drawer.classList.add('cart-open');
    backdrop.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
  } else {
    drawer.classList.remove('cart-open');
    backdrop.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
  }
}

function calculateShipping() {
  const cepInput = document.getElementById('cart-cep');
  const resultDiv = document.getElementById('shipping-result');
  if (!cepInput || !resultDiv) return;

  const rawCep = cepInput.value.replace(/\D/g, '');
  if (rawCep.length !== 8) {
    showToast('Informe um CEP válido com 8 dígitos.', 'error');
    return;
  }

  const subtotal = state.cart.reduce((acc, item) => acc + (item.preco * item.quantity), 0);
  state.shippingCep = rawCep;

  if (subtotal >= 99) {
    state.shippingCost = 0;
    resultDiv.innerHTML = `
      <div class="text-xs p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 flex items-center justify-between">
        <span>🚚 <strong>Frete Grátis Popular</strong></span>
        <span class="font-bold">2 a 3 dias</span>
      </div>
    `;
  } else {
    state.shippingCost = 10.90;
    resultDiv.innerHTML = `
      <div class="text-xs p-2 bg-slate-100 border border-slate-200 rounded-lg text-slate-700 flex items-center justify-between">
        <span>🚚 Entrega Econômica</span>
        <span class="font-bold text-slate-900">${formatCurrency(10.90)}</span>
      </div>
    `;
  }

  resultDiv.classList.remove('hidden');
  updateCartUI();
  showToast('Frete econômico calculado!');
}

function openCheckoutModal() {
  if (state.cart.length === 0) return;
  const modal = document.getElementById('checkout-modal');
  const list = document.getElementById('checkout-summary-list');
  const totalEl = document.getElementById('checkout-final-total');

  const subtotal = state.cart.reduce((acc, item) => acc + (item.preco * item.quantity), 0);
  if (list) {
    list.innerHTML = state.cart.map(i => `
      <div class="flex justify-between text-xs py-1">
        <span>${i.quantity}x ${i.nome}</span>
        <span class="font-bold">${formatCurrency(i.preco * i.quantity)}</span>
      </div>
    `).join('');
  }
  if (totalEl) totalEl.textContent = formatCurrency(subtotal);

  toggleCart(false);
  if (modal) modal.classList.remove('hidden');
}

function closeCheckoutModal() {
  const modal = document.getElementById('checkout-modal');
  if (modal) modal.classList.add('hidden');
}

function confirmOrder() {
  closeCheckoutModal();
  const successModal = document.getElementById('order-success-modal');
  const orderId = document.getElementById('success-order-id');
  if (orderId) orderId.textContent = `#POP-${Math.floor(100000 + Math.random() * 900000)}`;
  state.cart = [];
  saveCart();
  updateCartUI();
  if (successModal) successModal.classList.remove('hidden');
}

function closeSuccessModal() {
  const successModal = document.getElementById('order-success-modal');
  if (successModal) successModal.classList.add('hidden');
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  const bgColor = type === 'error' ? 'bg-rose-900' : 'bg-rose-700';

  toast.className = `${bgColor} text-white text-xs font-bold px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 toast-animate-in border border-white/20`;
  toast.innerHTML = `<span>${message}</span>`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('opacity-0', 'transition-opacity', 'duration-300');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function animateBadge() {
  const badge = document.getElementById('cart-badge');
  if (badge) {
    badge.classList.remove('badge-bump');
    void badge.offsetWidth;
    badge.classList.add('badge-bump');
  }
}

function setupEventListeners() {
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchTerm = e.target.value;
      filterAndRenderProducts();
    });
  }

  const sortSelect = document.getElementById('sort-select');
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      state.sortBy = e.target.value;
      filterAndRenderProducts();
    });
  }

  const categoryFilters = document.getElementById('category-filters');
  if (categoryFilters) {
    categoryFilters.addEventListener('click', (e) => {
      const btn = e.target.closest('.category-btn');
      if (!btn) return;

      state.selectedCategory = btn.dataset.category;
      initCategories();
      filterAndRenderProducts();
    });
  }

  const tarjaButtons = document.querySelectorAll('.tarja-filter-btn');
  tarjaButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tarjaButtons.forEach(b => {
        b.classList.remove('bg-rose-700', 'text-white');
        b.classList.add('bg-white', 'text-slate-700');
      });
      btn.classList.add('bg-rose-700', 'text-white');
      btn.classList.remove('bg-white', 'text-slate-700');

      state.selectedTarja = btn.dataset.tarja;
      filterAndRenderProducts();
    });
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      toggleCart(false);
      closeCheckoutModal();
      closeSuccessModal();
    }
  });
}
