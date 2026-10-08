/**
 * FarmaSim - Lógica da Vitrine Farmacêutica
 */

// Estado da Aplicação
const state = {
  products: typeof MEDICAMENTOS_DATA !== 'undefined' ? MEDICAMENTOS_DATA : [],
  filteredProducts: [],
  cart: JSON.parse(localStorage.getItem('farmasim_cart') || '[]'),
  searchTerm: '',
  selectedCategory: 'Todos',
  selectedTarja: 'Todos',
  sortBy: 'populares',
  appliedCoupon: null,
  shippingCost: null,
  shippingCep: ''
};

// Formatação de Moeda
function formatCurrency(value) {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
  initCategories();
  filterAndRenderProducts();
  updateCartUI();
  setupEventListeners();
});

// Setup de Categorias dinâmicas
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
        class="category-btn shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium transition-all duration-150 border ${
          isSelected 
            ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs' 
            : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/50'
        }"
      >
        ${cat}
      </button>
    `;
  }).join('');
}

// Filtrar e Renderizar Produtos
function filterAndRenderProducts() {
  let list = [...state.products];

  // Busca textual
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

  // Filtro Categoria
  if (state.selectedCategory !== 'Todos') {
    list = list.filter(p => p.categoria === state.selectedCategory);
  }

  // Filtro Tarja
  if (state.selectedTarja === 'livre') {
    list = list.filter(p => p.tarjaTipo === 'livre');
  } else if (state.selectedTarja === 'vermelha') {
    list = list.filter(p => p.tarjaTipo === 'vermelha');
  }

  // Ordenação
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

  // Atualizar contador
  const countEl = document.getElementById('results-count');
  if (countEl) {
    countEl.textContent = `${list.length} ${list.length === 1 ? 'medicamento exibido' : 'medicamentos exibidos'}`;
  }
}

// Renderizar Grade de Cards Corrigida e Alinhada
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
    const parcelas = (item.preco / 3).toFixed(2).replace('.', ',');
    const isVermelha = item.tarjaTipo === 'vermelha';
    const productUrl = `produto.html?id=${item.id}`;

    return `
      <article class="card-hover-effect flex flex-col h-full bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs hover:border-emerald-300 hover:shadow-md transition-all">
        
        <!-- Imagem com Altura Padronizada de 208px (h-52) com packshot nítido -->
        <a href="${productUrl}" class="block relative w-full h-52 bg-slate-50 overflow-hidden group shrink-0 flex items-center justify-center p-3" title="Ver página de ${item.nome}">
          <img 
            src="${item.imagem}" 
            alt="${item.nome}"
            loading="lazy"
            class="w-full h-full object-contain object-center group-hover:scale-105 transition-transform duration-300"
            onerror="this.src='images/metformina.jpg'"
          />
          <div class="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/10 transition-colors duration-200"></div>

          <!-- Badge da Tarja (Canto superior esquerdo) -->
          <div class="absolute top-3 left-3">
            ${isVermelha 
              ? `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold bg-rose-600 text-white shadow-xs">
                   <span class="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
                   Tarja Vermelha
                 </span>`
              : `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-xs">
                   <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                   Venda Livre
                 </span>`
            }
          </div>

          <!-- Badge da Categoria (Canto inferior esquerdo) -->
          <span class="absolute bottom-3 left-3 bg-white/95 backdrop-blur-xs text-slate-700 text-[11px] font-medium px-2.5 py-0.5 rounded-md border border-slate-200/80 shadow-xs">
            ${item.categoria}
          </span>
        </a>

        <!-- Corpo do Card -->
        <div class="p-4 sm:p-5 flex-1 flex flex-col justify-between">
          <div>
            <!-- Meta: Laboratório & Avaliação -->
            <div class="flex items-center justify-between mb-1.5 text-xs">
              <span class="text-slate-400 font-medium truncate max-w-[140px]">${item.laboratorio}</span>
              <span class="text-amber-500 font-bold shrink-0">
                ★ ${item.avaliacao} <span class="text-slate-400 font-normal">(${item.avaliacoesTotal})</span>
              </span>
            </div>

            <!-- Título do Remédio com Link dedicado -->
            <h3 class="text-base font-bold text-slate-900 mb-0.5 leading-snug">
              <a href="${productUrl}" class="hover:text-emerald-700 transition-colors line-clamp-1" title="${item.nome} ${item.dosagem}">
                ${item.nome} <span class="text-xs font-normal text-slate-500">(${item.dosagem})</span>
              </a>
            </h3>

            <!-- Apresentação em tipografia limpa -->
            <p class="text-xs text-slate-500 font-medium mb-3 truncate">
              ${item.apresentacao}
            </p>
          </div>

          <!-- Rodapé do Card: Preço e Botões -->
          <div class="pt-3 border-t border-slate-100 mt-auto">
            <div class="flex items-baseline justify-between mb-3">
              <div>
                <span class="text-[10px] uppercase font-bold text-slate-400 block tracking-wider leading-none">Preço</span>
                <span class="text-xl sm:text-2xl font-black text-emerald-700">
                  ${formatCurrency(item.preco)}
                </span>
              </div>
              <div class="text-right text-[11px] text-slate-500">
                <span>3x de R$ ${parcelas}</span>
                <span class="text-[10px] text-slate-400 block">sem juros</span>
              </div>
            </div>

            <!-- Ações: Link para URL dedicada do remédio + Comprar rápido -->
            <div class="grid grid-cols-5 gap-2">
              <a 
                href="${productUrl}"
                class="col-span-2 px-2.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors text-center flex items-center justify-center"
              >
                Detalhes
              </a>
              <button 
                type="button" 
                onclick="quickAddToCart(${item.id})"
                class="col-span-3 px-3 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5"
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/>
                </svg>
                <span>Comprar</span>
              </button>
            </div>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

// Gerenciamento do Carrinho
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
  showToast(`✓ ${product.nome} adicionado ao carrinho!`);
  animateBadge();
}

function removeFromCart(productId) {
  state.cart = state.cart.filter(item => item.id !== productId);
  saveCart();
  updateCartUI();
  showToast('Item removido do carrinho.', 'info');
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
  localStorage.setItem('farmasim_cart', JSON.stringify(state.cart));
}

// Atualizar Interface do Carrinho
function updateCartUI() {
  const totalItems = state.cart.reduce((acc, item) => acc + item.quantity, 0);
  const subtotal = state.cart.reduce((acc, item) => acc + (item.preco * item.quantity), 0);

  // Badge do Header
  const badge = document.getElementById('cart-badge');
  const badgeHeaderTotal = document.getElementById('cart-header-total');
  if (badge) {
    badge.textContent = totalItems;
    badge.classList.toggle('hidden', totalItems === 0);
  }
  if (badgeHeaderTotal) {
    badgeHeaderTotal.textContent = formatCurrency(subtotal);
  }

  // Lista no Drawer
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
        <div class="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <img 
            src="${item.imagem}" 
            alt="${item.nome}" 
            class="w-14 h-14 rounded-lg object-cover bg-slate-100 border border-slate-200 shrink-0"
            onerror="this.src='https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&auto=format&fit=crop&q=80'"
          />
          <div class="flex-1 min-w-0">
            <h4 class="text-xs sm:text-sm font-bold text-slate-800 truncate">${item.nome} <span class="font-normal text-slate-500">${item.dosagem}</span></h4>
            <div class="text-xs font-bold text-emerald-700">${formatCurrency(item.preco)}</div>
            <div class="flex items-center gap-2 mt-2">
              <div class="flex items-center border border-slate-200 rounded-lg bg-slate-50">
                <button type="button" onclick="updateCartItemQuantity(${item.id}, -1)" class="w-6 h-6 flex items-center justify-center text-slate-600 hover:bg-slate-200 font-bold text-xs">−</button>
                <span class="w-6 text-center text-xs font-bold text-slate-800">${item.quantity}</span>
                <button type="button" onclick="updateCartItemQuantity(${item.id}, 1)" class="w-6 h-6 flex items-center justify-center text-slate-600 hover:bg-slate-200 font-bold text-xs">+</button>
              </div>
              <button type="button" onclick="removeFromCart(${item.id})" class="text-slate-400 hover:text-rose-600 p-1 text-xs transition-colors" title="Remover item">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
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

  // Cálculos financeiros
  let discount = 0;
  if (state.appliedCoupon) {
    discount = subtotal * state.appliedCoupon.percent;
  }

  let finalShipping = 0;
  if (state.shippingCost !== null) {
    finalShipping = subtotal >= 99 ? 0 : state.shippingCost;
  }

  const grandTotal = Math.max(0, subtotal - discount + finalShipping);

  const subtotalEl = document.getElementById('cart-subtotal');
  const discountRow = document.getElementById('cart-discount-row');
  const discountEl = document.getElementById('cart-discount');
  const shippingEl = document.getElementById('cart-shipping');
  const totalEl = document.getElementById('cart-grand-total');

  if (subtotalEl) subtotalEl.textContent = formatCurrency(subtotal);

  if (discountRow && discountEl) {
    if (state.appliedCoupon) {
      discountRow.classList.remove('hidden');
      discountEl.textContent = `- ${formatCurrency(discount)}`;
    } else {
      discountRow.classList.add('hidden');
    }
  }

  if (shippingEl) {
    if (state.shippingCost === null) {
      shippingEl.textContent = 'Calcule abaixo';
      shippingEl.className = 'text-xs text-slate-400';
    } else if (finalShipping === 0) {
      shippingEl.textContent = 'GRÁTIS (Promoção)';
      shippingEl.className = 'text-xs font-bold text-emerald-600';
    } else {
      shippingEl.textContent = formatCurrency(finalShipping);
      shippingEl.className = 'text-xs font-semibold text-slate-700';
    }
  }

  if (totalEl) totalEl.textContent = formatCurrency(grandTotal);
}

// Gaveta do Carrinho
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

// Cálculo de Frete Simulado
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
        <span>🚚 <strong>Frete Grátis</strong> (Acima de R$ 99)</span>
        <span class="font-bold">2 a 3 dias</span>
      </div>
    `;
  } else {
    state.shippingCost = 14.90;
    resultDiv.innerHTML = `
      <div class="text-xs p-2 bg-slate-100 border border-slate-200 rounded-lg text-slate-700 flex items-center justify-between">
        <span>🚚 Entrega Padrão</span>
        <span class="font-bold text-slate-900">${formatCurrency(14.90)} (3 a 5 dias)</span>
      </div>
    `;
  }

  resultDiv.classList.remove('hidden');
  updateCartUI();
  showToast('Frete calculado!');
}

// Cupom de Desconto
function applyCoupon() {
  const couponInput = document.getElementById('cart-coupon');
  if (!couponInput) return;

  const code = couponInput.value.trim().toUpperCase();
  if (code === 'FARMASIM10') {
    state.appliedCoupon = { code: 'FARMASIM10', percent: 0.10 };
    showToast('Cupom FARMASIM10 ativado (10% de desconto)!');
  } else if (code === 'BEMVINDO') {
    state.appliedCoupon = { code: 'BEMVINDO', percent: 0.15 };
    showToast('Cupom BEMVINDO ativado (15% de desconto)!');
  } else {
    showToast('Cupom inválido. Experimente: FARMASIM10', 'error');
    return;
  }

  couponInput.disabled = true;
  updateCartUI();
}

// Checkout Simulado
function openCheckoutModal() {
  if (state.cart.length === 0) {
    showToast('Seu carrinho está vazio!', 'error');
    return;
  }

  const checkoutModal = document.getElementById('checkout-modal');
  const summaryList = document.getElementById('checkout-summary-list');
  const checkoutTotal = document.getElementById('checkout-final-total');
  const prescriptionWarning = document.getElementById('checkout-prescription-warning');

  const hasPrescription = state.cart.some(item => item.tarjaTipo === 'vermelha');
  if (prescriptionWarning) {
    prescriptionWarning.classList.toggle('hidden', !hasPrescription);
  }

  const subtotal = state.cart.reduce((acc, item) => acc + (item.preco * item.quantity), 0);
  const discount = state.appliedCoupon ? subtotal * state.appliedCoupon.percent : 0;
  const shipping = state.shippingCost !== null ? (subtotal >= 99 ? 0 : state.shippingCost) : 0;
  const total = Math.max(0, subtotal - discount + shipping);

  if (summaryList) {
    summaryList.innerHTML = state.cart.map(item => `
      <div class="flex justify-between items-center text-xs py-1.5 border-b border-slate-100">
        <span class="text-slate-700">${item.quantity}x ${item.nome} (${item.dosagem})</span>
        <span class="font-bold text-slate-900">${formatCurrency(item.preco * item.quantity)}</span>
      </div>
    `).join('');
  }

  if (checkoutTotal) {
    checkoutTotal.textContent = formatCurrency(total);
  }

  toggleCart(false);
  if (checkoutModal) checkoutModal.classList.remove('hidden');
}

function closeCheckoutModal() {
  const checkoutModal = document.getElementById('checkout-modal');
  if (checkoutModal) checkoutModal.classList.add('hidden');
}

function confirmOrder() {
  const checkoutModal = document.getElementById('checkout-modal');
  const successModal = document.getElementById('order-success-modal');
  const orderIdSpan = document.getElementById('success-order-id');

  if (checkoutModal) checkoutModal.classList.add('hidden');

  const randomId = Math.floor(100000 + Math.random() * 900000);
  if (orderIdSpan) orderIdSpan.textContent = `#SIM-${randomId}`;

  state.cart = [];
  state.appliedCoupon = null;
  state.shippingCost = null;
  saveCart();
  updateCartUI();

  if (successModal) successModal.classList.remove('hidden');
}

function closeSuccessModal() {
  const successModal = document.getElementById('order-success-modal');
  if (successModal) successModal.classList.add('hidden');
}

// Microinterações e Toasts
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  const bgColor = type === 'error' ? 'bg-rose-600' : (type === 'info' ? 'bg-slate-800' : 'bg-emerald-600');

  toast.className = `${bgColor} text-white text-xs sm:text-sm font-semibold px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 toast-animate-in border border-white/20`;
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

// Event Listeners Gerais
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
        b.classList.remove('bg-slate-900', 'text-white', 'border-slate-900');
        b.classList.add('bg-white', 'text-slate-600', 'border-slate-200');
      });
      btn.classList.add('bg-slate-900', 'text-white', 'border-slate-900');
      btn.classList.remove('bg-white', 'text-slate-600', 'border-slate-200');

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
