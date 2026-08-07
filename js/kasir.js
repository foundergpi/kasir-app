/**
 * Kasir.js - Logic halaman POS / Kasir
 */
const Kasir = (() => {
  let cart = [];
  let products = [];
  let categories = [];
  let activeCategory = 'Semua';
  let paymentMethod = 'Tunai';
  let heldOrders = [];

  const fmt = (n) => new Intl.NumberFormat('id-ID').format(n);

  async function init() {
    products = await KasirDB.getAll(KasirDB.STORES.PRODUCTS);
    categories = await KasirDB.getAll(KasirDB.STORES.CATEGORIES);
    heldOrders = await KasirDB.getAll(KasirDB.STORES.HELD_ORDERS);
    renderCategories();
    renderProducts();
    renderCart();
    bindEvents();
  }

  function renderCategories() {
    const el = document.getElementById('pos-categories');
    const cats = ['Semua', ...categories.map(c => c.name)];
    el.innerHTML = cats.map(c => `
      <button class="category-pill ${c === activeCategory ? 'active' : ''}" data-cat="${c}">${c}</button>
    `).join('');
    el.querySelectorAll('.category-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        activeCategory = btn.dataset.cat;
        el.querySelectorAll('.category-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderProducts();
      });
    });
  }

  function renderProducts(filter = '') {
    const grid = document.getElementById('product-grid');
    const search = filter || document.getElementById('pos-search')?.value.toLowerCase() || '';
    let filtered = products.filter(p => {
      const matchCat = activeCategory === 'Semua' || p.category === activeCategory;
      const matchSearch = !search || p.name.toLowerCase().includes(search) || (p.barcode && p.barcode.includes(search));
      return matchCat && matchSearch;
    });

    if (filtered.length === 0) {
      grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted)">
        <div style="font-size:40px;margin-bottom:8px">📦</div>
        <div>Produk tidak ditemukan</div>
      </div>`;
      return;
    }

    const emojis = { 'Makanan': '🍱', 'Minuman': '🥤', 'Snack': '🍟', 'Sembako': '🛒', 'Lainnya': '📦' };
    grid.innerHTML = filtered.map(p => {
      const oos = p.stock <= 0;
      const emoji = emojis[p.category] || '📦';
      return `
        <div class="product-card ${oos ? 'out-of-stock' : ''}" data-id="${p.id}" title="${oos ? 'Stok habis' : p.name}">
          <div class="product-emoji">${emoji}</div>
          <div class="product-name">${p.name}</div>
          <div class="product-price">Rp ${fmt(p.sell_price)}</div>
          <div class="product-stock ${p.stock <= 5 ? 'text-warning' : ''}">${oos ? '⚠️ Habis' : 'Stok: ' + p.stock + ' ' + (p.unit || '')}</div>
        </div>
      `;
    }).join('');

    grid.querySelectorAll('.product-card:not(.out-of-stock)').forEach(card => {
      card.addEventListener('click', () => addToCart(parseInt(card.dataset.id)));
    });
  }

  function addToCart(productId) {
    const prod = products.find(p => p.id === productId);
    if (!prod) return;

    const existing = cart.find(i => i.product_id === productId);
    if (existing) {
      if (existing.qty >= prod.stock) {
        showToast('Stok tidak mencukupi', 'warning');
        return;
      }
      existing.qty++;
    } else {
      cart.push({ product_id: productId, name: prod.name, price: prod.sell_price, qty: 1, discount: 0 });
    }
    renderCart();
    showToast(`${prod.name} ditambahkan`, 'success', 1500);
  }

  function updateQty(productId, delta) {
    const idx = cart.findIndex(i => i.product_id === productId);
    if (idx < 0) return;
    const prod = products.find(p => p.id === productId);
    cart[idx].qty += delta;
    if (cart[idx].qty <= 0) cart.splice(idx, 1);
    else if (prod && cart[idx].qty > prod.stock) {
      cart[idx].qty = prod.stock;
      showToast('Stok tidak mencukupi', 'warning');
    }
    renderCart();
  }

  function removeFromCart(productId) {
    cart = cart.filter(i => i.product_id !== productId);
    renderCart();
  }

  function updateDiscount(productId, val) {
    const item = cart.find(i => i.product_id === productId);
    if (item) item.discount = Math.max(0, Math.min(100, parseFloat(val) || 0));
    renderCart();
  }

  function calcTotals() {
    let subtotal = 0, discTotal = 0;
    for (const item of cart) {
      const sub = item.qty * item.price;
      const disc = item.discount ? Math.round(sub * item.discount / 100) : 0;
      subtotal += sub;
      discTotal += disc;
    }

    // Diskon global
    const discGlobal = parseFloat(document.getElementById('disc-global')?.value) || 0;
    const discGlobalAmt = discGlobal ? Math.round((subtotal - discTotal) * discGlobal / 100) : 0;

    const total = subtotal - discTotal - discGlobalAmt;
    return { subtotal, discTotal, discGlobalAmt, total };
  }

  function renderCart() {
    const itemsEl  = document.getElementById('cart-items');
    const countEl  = document.getElementById('cart-count');
    const { subtotal, discTotal, discGlobalAmt, total } = calcTotals();

    const totalItems = cart.reduce((s, i) => s + i.qty, 0);
    countEl.textContent = totalItems;

    if (cart.length === 0) {
      itemsEl.innerHTML = `<div class="cart-empty">
        <div class="big-icon">🛒</div>
        <div>Keranjang kosong</div>
        <div class="text-xs text-muted">Pilih produk untuk mulai transaksi</div>
      </div>`;
    } else {
      itemsEl.innerHTML = cart.map(item => {
        const sub = item.qty * item.price;
        const disc = item.discount ? Math.round(sub * item.discount / 100) : 0;
        const total = sub - disc;
        return `
          <div class="cart-item" data-id="${item.product_id}">
            <div class="cart-item-name">${item.name}</div>
            <div class="cart-item-row">
              <button class="qty-btn btn-qty-minus" data-id="${item.product_id}">−</button>
              <span class="qty-display">${item.qty}</span>
              <button class="qty-btn btn-qty-plus" data-id="${item.product_id}">+</button>
              <span class="cart-item-price">× Rp ${fmt(item.price)}</span>
              <span class="cart-item-total">Rp ${fmt(total)}</span>
              <button class="btn-remove-item" data-id="${item.product_id}" title="Hapus">✕</button>
            </div>
            <div class="cart-item-row" style="margin-top:4px">
              <span class="text-xs text-muted">Diskon %</span>
              <input type="number" class="cart-item-disc disc-input" data-id="${item.product_id}"
                value="${item.discount || ''}" min="0" max="100" placeholder="0">
            </div>
          </div>
        `;
      }).join('');

      // Bind qty buttons
      itemsEl.querySelectorAll('.btn-qty-minus').forEach(b => b.addEventListener('click', () => updateQty(parseInt(b.dataset.id), -1)));
      itemsEl.querySelectorAll('.btn-qty-plus').forEach(b => b.addEventListener('click', () => updateQty(parseInt(b.dataset.id), 1)));
      itemsEl.querySelectorAll('.btn-remove-item').forEach(b => b.addEventListener('click', () => removeFromCart(parseInt(b.dataset.id))));
      itemsEl.querySelectorAll('.disc-input').forEach(i => i.addEventListener('change', () => updateDiscount(parseInt(i.dataset.id), i.value)));
    }

    // Update summary
    document.getElementById('summary-subtotal').textContent = 'Rp ' + fmt(subtotal);
    document.getElementById('summary-disc').textContent = '-Rp ' + fmt(discTotal + discGlobalAmt);
    document.getElementById('summary-total').textContent = 'Rp ' + fmt(total);
    document.getElementById('btn-bayar').disabled = cart.length === 0;

    // Update kembalian
    updateKembalian();
  }

  function updateKembalian() {
    const { total } = calcTotals();
    const paid = parseInt(document.getElementById('input-bayar')?.value?.replace(/\D/g, '') || '0');
    const change = paid - total;
    const el = document.getElementById('summary-kembali');
    const wrapEl = document.getElementById('kembali-wrap');
    if (el && wrapEl) {
      if (paymentMethod === 'Tunai') {
        wrapEl.classList.remove('hidden');
        el.textContent = 'Rp ' + fmt(Math.max(0, change));
        el.style.color = change < 0 ? 'var(--danger)' : 'var(--success)';
      } else {
        wrapEl.classList.add('hidden');
      }
    }
  }

  function bindEvents() {
    // Search
    document.getElementById('pos-search')?.addEventListener('input', e => renderProducts(e.target.value.toLowerCase()));

    // Bayar button
    document.getElementById('btn-bayar')?.addEventListener('click', openPaymentModal);

    // Hold order
    document.getElementById('btn-hold')?.addEventListener('click', holdOrder);

    // Clear cart
    document.getElementById('btn-clear-cart')?.addEventListener('click', () => {
      if (cart.length && confirm('Kosongkan keranjang?')) {
        cart = [];
        renderCart();
      }
    });

    // Held orders
    document.getElementById('btn-held-orders')?.addEventListener('click', openHeldOrders);

    // Diskon global
    document.getElementById('disc-global')?.addEventListener('input', renderCart);
    if (typeof updateAllPrinterUI === 'function') updateAllPrinterUI();
  }

  function openPaymentModal() {
    const { subtotal, discTotal, discGlobalAmt, total } = calcTotals();
    const modal = document.getElementById('modal-payment');
    modal.classList.remove('hidden');

    document.getElementById('pay-total-display').textContent = 'Rp ' + fmt(total);
    document.getElementById('input-bayar').value = '';
    document.getElementById('pay-kembali').textContent = 'Rp 0';

    // Quick money buttons
    const quickAmts = [total, roundUp(total, 5000), roundUp(total, 10000), roundUp(total, 50000), roundUp(total, 100000)];
    const uniqueAmts = [...new Set(quickAmts)].slice(0, 4);
    document.getElementById('quick-money-btns').innerHTML = uniqueAmts.map(a =>
      `<button class="btn btn-ghost btn-sm quick-money" data-amt="${a}">Rp ${fmt(a)}</button>`
    ).join('');
    document.querySelectorAll('.quick-money').forEach(b => {
      b.addEventListener('click', () => {
        document.getElementById('input-bayar').value = b.dataset.amt;
        calcKembalianModal();
      });
    });

    // Payment method tabs in modal
    document.querySelectorAll('.modal-pay-method').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.method === paymentMethod);
      btn.addEventListener('click', () => {
        paymentMethod = btn.dataset.method;
        document.querySelectorAll('.modal-pay-method').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tunaiWrap = document.getElementById('tunai-section');
        tunaiWrap.classList.toggle('hidden', paymentMethod !== 'Tunai');
      });
    });

    const tunaiSection = document.getElementById('tunai-section');
    tunaiSection?.classList.toggle('hidden', paymentMethod !== 'Tunai');

    document.getElementById('input-bayar')?.addEventListener('input', calcKembalianModal);
    document.getElementById('btn-confirm-bayar')?.addEventListener('click', () => processPayment(total));
    document.getElementById('btn-cancel-payment')?.addEventListener('click', closePaymentModal);
  }

  function calcKembalianModal() {
    const { total } = calcTotals();
    const paid = parseInt(document.getElementById('input-bayar')?.value?.replace(/\D/g, '') || '0');
    const change = paid - total;
    const el = document.getElementById('pay-kembali');
    if (el) {
      el.textContent = 'Rp ' + fmt(Math.max(0, change));
      el.style.color = change < 0 ? 'var(--danger)' : 'var(--success-light)';
    }
  }

  function roundUp(val, to) { return Math.ceil(val / to) * to; }

  function closePaymentModal() {
    document.getElementById('modal-payment')?.classList.add('hidden');
  }

  async function processPayment(total) {
    const paid = paymentMethod === 'Tunai'
      ? parseInt(document.getElementById('input-bayar')?.value?.replace(/\D/g, '') || '0')
      : total;

    if (paymentMethod === 'Tunai' && paid < total) {
      showToast('Uang bayar kurang!', 'error');
      return;
    }

    const invoice = await KasirDB.generateInvoice();
    const now = new Date();

    // Simpan transaksi
    const txId = await KasirDB.add(KasirDB.STORES.TRANSACTIONS, {
      invoice,
      cashier_id: 1,
      cashier_name: 'Kasir',
      date: now.toISOString(),
      payment_method: paymentMethod,
      subtotal: cart.reduce((s, i) => s + i.qty * i.price, 0),
      discount_total: cart.reduce((s, i) => s + Math.round(i.qty * i.price * (i.discount || 0) / 100), 0),
      total,
      paid,
      change: paid - total,
      items_count: cart.reduce((s, i) => s + i.qty, 0),
    });

    // Simpan items
    for (const item of cart) {
      await KasirDB.add(KasirDB.STORES.TRANSACTION_ITEMS, {
        transaction_id: txId,
        product_id: item.product_id,
        name: item.name,
        price: item.price,
        qty: item.qty,
        discount: item.discount || 0,
        subtotal: item.qty * item.price - Math.round(item.qty * item.price * (item.discount || 0) / 100),
      });

      // Update stok
      const prod = await KasirDB.getById(KasirDB.STORES.PRODUCTS, item.product_id);
      if (prod) {
        prod.stock = Math.max(0, prod.stock - item.qty);
        await KasirDB.update(KasirDB.STORES.PRODUCTS, prod);
      }
    }

    // Print struk data (build in advance)
    const settings = {
      toko_name:    await KasirDB.getSetting('toko_name') || 'Toko Saya',
      toko_address: await KasirDB.getSetting('toko_address'),
      toko_phone:   await KasirDB.getSetting('toko_phone'),
      printer_width: await KasirDB.getSetting('printer_width') || '58mm',
      footer:       await KasirDB.getSetting('footer_struk'),
    };

    const strukturData = {
      ...settings,
      invoice,
      cashier_name: 'Kasir',
      date_str: now.toLocaleString('id-ID'),
      payment_method: paymentMethod,
      items: [...cart],
      subtotal: cart.reduce((s, i) => s + i.qty * i.price, 0),
      discount_total: cart.reduce((s, i) => s + Math.round(i.qty * i.price * (i.discount || 0) / 100), 0),
      total,
      paid,
      change: paid - total,
    };

    // Reset cart AFTER capturing data
    const savedCart = [...cart];
    cart = [];
    products = await KasirDB.getAll(KasirDB.STORES.PRODUCTS);
    renderProducts();
    renderCart();

    // ===== Show success screen inside modal =====
    showPaymentSuccess(strukturData, settings, invoice);
  }

  function showPaymentSuccess(strukturData, settings, invoice) {
    const modal = document.getElementById('modal-payment');
    if (!modal) return;

    const change = strukturData.change;
    const changeText = change >= 0
      ? `<div style="margin-top:6px;font-size:13px;color:var(--text-muted)">Kembalian: <strong style="color:var(--success)">Rp ${fmt(change)}</strong></div>`
      : '';

    modal.querySelector('.modal').innerHTML = `
      <div style="text-align:center;padding:24px 20px">
        <div style="font-size:52px;margin-bottom:10px">✅</div>
        <div style="font-size:18px;font-weight:800;color:var(--success);margin-bottom:4px">Pembayaran Berhasil!</div>
        <div style="font-size:13px;color:var(--text-muted);margin-bottom:2px">Invoice: <strong>${invoice}</strong></div>
        <div style="font-size:15px;color:var(--text-primary);font-weight:700">Total: Rp ${fmt(strukturData.total)}</div>
        ${changeText}
      </div>
      <div style="display:flex;gap:10px;padding:0 16px 20px">
        <button id="btn-success-print" class="btn btn-info" style="flex:1;padding:13px">
          🖨️ Print Struk
        </button>
        <button id="btn-success-done" class="btn btn-success" style="flex:1;padding:13px">
          ✅ Selesai
        </button>
      </div>
    `;

    document.getElementById('btn-success-print')?.addEventListener('click', async () => {
      await Printer.printStruk(strukturData, settings);
    });

    document.getElementById('btn-success-done')?.addEventListener('click', () => {
      modal.classList.add('hidden');
      // Restore modal to original state for next transaction
      resetPaymentModal();
    });
  }

  function resetPaymentModal() {
    // Restore modal HTML to original payment form
    const modal = document.getElementById('modal-payment');
    if (!modal) return;
    modal.querySelector('.modal').innerHTML = `
      <div class="modal-header">
        <div class="modal-title">💳 Pembayaran</div>
        <button class="btn-close-modal" id="btn-cancel-payment">✕</button>
      </div>
      <div style="text-align:center;margin-bottom:20px">
        <div style="font-size:13px;color:var(--text-muted)">Total yang harus dibayar</div>
        <div id="pay-total-display" style="font-size:36px;font-weight:800;color:var(--success)">Rp 0</div>
      </div>
      <div class="payment-methods" style="margin-bottom:16px">
        <button class="pay-method-btn modal-pay-method active" data-method="Tunai">💵 Tunai</button>
        <button class="pay-method-btn modal-pay-method" data-method="QRIS">📱 QRIS</button>
        <button class="pay-method-btn modal-pay-method" data-method="Transfer">🏦 Transfer</button>
      </div>
      <div id="tunai-section">
        <div class="form-group">
          <label>Uang Bayar</label>
          <div class="money-input-wrap">
            <span class="currency-prefix">Rp</span>
            <input type="number" id="input-bayar" placeholder="0" min="0">
          </div>
        </div>
        <div id="quick-money-btns" class="flex gap-2 flex-wrap mb-4"></div>
        <div class="summary-row" style="font-size:15px">
          <span class="fw-700">Kembalian</span>
          <span id="pay-kembali" class="fw-700 text-success">Rp 0</span>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" id="btn-cancel-payment-2">Batal</button>
        <button class="btn btn-success" id="btn-confirm-bayar" style="min-width:140px">
          ✅ Konfirmasi Bayar
        </button>
      </div>
    `;

    // Re-bind payment modal events
    document.getElementById('btn-cancel-payment')?.addEventListener('click', closePaymentModal);
    document.getElementById('btn-cancel-payment-2')?.addEventListener('click', closePaymentModal);
    document.getElementById('btn-confirm-bayar')?.addEventListener('click', () => {
      const total = cart.reduce((s, i) => {
        const disc = Math.round(i.qty * i.price * (i.discount || 0) / 100);
        return s + i.qty * i.price - disc;
      }, 0);
      const globalDisc = parseInt(document.getElementById('disc-global')?.value || '0');
      const finalTotal = Math.round(total * (1 - globalDisc / 100));
      processPayment(finalTotal);
    });
    document.querySelectorAll('.modal-pay-method').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.modal-pay-method').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        paymentMethod = btn.dataset.method;
        document.getElementById('tunai-section').style.display = paymentMethod === 'Tunai' ? '' : 'none';
      });
    });
    document.getElementById('input-bayar')?.addEventListener('input', () => {
      const t = parseInt(document.getElementById('pay-total-display')?.textContent?.replace(/\D/g, '') || '0');
      const p = parseInt(document.getElementById('input-bayar')?.value?.replace(/\D/g, '') || '0');
      const el = document.getElementById('pay-kembali');
      if (el) {
        const change = p - t;
        el.textContent = 'Rp ' + fmt(Math.max(0, change));
        el.style.color = change < 0 ? 'var(--danger)' : 'var(--success-light)';
      }
    });
  }

  async function holdOrder() {
    if (cart.length === 0) { showToast('Keranjang kosong', 'warning'); return; }
    const label = prompt('Label pesanan tertahan (opsional):', 'Meja ' + (heldOrders.length + 1));
    if (label === null) return;
    await KasirDB.add(KasirDB.STORES.HELD_ORDERS, {
      label: label || 'Order ' + Date.now(),
      items: [...cart],
      held_at: new Date().toISOString(),
    });
    heldOrders = await KasirDB.getAll(KasirDB.STORES.HELD_ORDERS);
    cart = [];
    renderCart();
    showToast('Pesanan ditahan', 'info');
    document.getElementById('held-count').textContent = heldOrders.length || '';
  }

  async function openHeldOrders() {
    heldOrders = await KasirDB.getAll(KasirDB.STORES.HELD_ORDERS);
    const modal = document.getElementById('modal-held');
    modal.classList.remove('hidden');

    const listEl = document.getElementById('held-list');
    if (heldOrders.length === 0) {
      listEl.innerHTML = '<div class="text-muted text-sm" style="text-align:center;padding:20px">Tidak ada pesanan tertahan</div>';
      return;
    }
    listEl.innerHTML = heldOrders.map(o => `
      <div class="held-item" data-id="${o.id}">
        <div>
          <div class="fw-700">${o.label}</div>
          <div class="text-xs text-muted">${o.items.length} produk · ${new Date(o.held_at).toLocaleTimeString('id-ID')}</div>
        </div>
        <div class="flex gap-2">
          <button class="btn btn-info btn-sm btn-resume-held" data-id="${o.id}">Lanjut</button>
          <button class="btn btn-danger btn-sm btn-delete-held" data-id="${o.id}">Hapus</button>
        </div>
      </div>
    `).join('');

    listEl.querySelectorAll('.btn-resume-held').forEach(b => {
      b.addEventListener('click', async () => {
        const order = heldOrders.find(o => o.id === parseInt(b.dataset.id));
        if (order) {
          cart = [...order.items];
          await KasirDB.remove(KasirDB.STORES.HELD_ORDERS, order.id);
          heldOrders = heldOrders.filter(o => o.id !== order.id);
          renderCart();
          closeModal('modal-held');
          showToast('Pesanan dilanjutkan', 'success');
        }
      });
    });

    listEl.querySelectorAll('.btn-delete-held').forEach(b => {
      b.addEventListener('click', async () => {
        await KasirDB.remove(KasirDB.STORES.HELD_ORDERS, parseInt(b.dataset.id));
        heldOrders = heldOrders.filter(o => o.id !== parseInt(b.dataset.id));
        openHeldOrders();
        document.getElementById('held-count').textContent = heldOrders.length || '';
      });
    });

    document.getElementById('btn-close-held')?.addEventListener('click', () => closeModal('modal-held'));
  }

  return { init };
})();
