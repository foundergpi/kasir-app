/**
 * Produk.js - Manajemen produk & stok
 */
const Produk = (() => {
  let products = [];
  let categories = [];
  let editingId = null;

  const fmt = (n) => new Intl.NumberFormat('id-ID').format(n);

  async function init() {
    products = await KasirDB.getAll(KasirDB.STORES.PRODUCTS);
    categories = await KasirDB.getAll(KasirDB.STORES.CATEGORIES);
    renderTable();
    bindEvents();
  }

  function renderTable(filter = '') {
    const tbody = document.getElementById('product-tbody');
    const search = filter.toLowerCase();
    const filtered = products.filter(p =>
      !search || p.name.toLowerCase().includes(search) || (p.barcode || '').includes(search)
    );

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-muted)">
        📦 Tidak ada produk ditemukan
      </td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(p => {
      let stockBadge;
      if (p.stock <= 0) stockBadge = `<span class="badge badge-danger">Habis</span>`;
      else if (p.stock <= 5) stockBadge = `<span class="badge badge-warning">${p.stock} ${p.unit || ''}</span>`;
      else stockBadge = `<span class="badge badge-success">${p.stock} ${p.unit || ''}</span>`;

      const profit = p.sell_price - p.buy_price;
      const profitPct = p.buy_price ? Math.round(profit / p.buy_price * 100) : 0;

      return `
        <tr>
          <td>
            <div class="fw-700">${p.name}</div>
            <div class="text-xs text-muted">${p.barcode || '—'}</div>
          </td>
          <td><span class="badge badge-accent">${p.category || '—'}</span></td>
          <td>Rp ${fmt(p.buy_price)}</td>
          <td>Rp ${fmt(p.sell_price)}</td>
          <td>
            <div class="text-success">+Rp ${fmt(profit)}</div>
            <div class="text-xs text-muted">${profitPct}%</div>
          </td>
          <td>${stockBadge}</td>
          <td>
            <div class="flex gap-2">
              <button class="btn btn-info btn-sm btn-edit-prod" data-id="${p.id}" title="Edit">✏️</button>
              <button class="btn btn-warning btn-sm btn-adj-stock" data-id="${p.id}" title="Sesuaikan stok">📦</button>
              <button class="btn btn-danger btn-sm btn-del-prod" data-id="${p.id}" title="Hapus">🗑️</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.btn-edit-prod').forEach(b => b.addEventListener('click', () => openModal(parseInt(b.dataset.id))));
    tbody.querySelectorAll('.btn-del-prod').forEach(b => b.addEventListener('click', () => deleteProduct(parseInt(b.dataset.id))));
    tbody.querySelectorAll('.btn-adj-stock').forEach(b => b.addEventListener('click', () => adjustStock(parseInt(b.dataset.id))));
  }

  function bindEvents() {
    document.getElementById('prod-search')?.addEventListener('input', e => renderTable(e.target.value));
    document.getElementById('btn-add-prod')?.addEventListener('click', () => openModal(null));
    document.getElementById('btn-close-prod-modal')?.addEventListener('click', () => closeModal('modal-produk'));
    document.getElementById('prod-form')?.addEventListener('submit', saveProduct);
    document.getElementById('btn-import-csv')?.addEventListener('click', importCSV);
    document.getElementById('btn-export-csv')?.addEventListener('click', exportCSV);
  }

  function openModal(id) {
    editingId = id;
    const modal = document.getElementById('modal-produk');
    const title = document.getElementById('modal-prod-title');
    const form  = document.getElementById('prod-form');

    // Isi dropdown kategori
    const catSel = document.getElementById('prod-category');
    catSel.innerHTML = categories.map(c => `<option value="${c.name}">${c.name}</option>`).join('');

    if (id) {
      const p = products.find(x => x.id === id);
      if (!p) return;
      title.textContent = 'Edit Produk';
      form.elements['prod-name'].value = p.name;
      form.elements['prod-barcode'].value = p.barcode || '';
      catSel.value = p.category;
      form.elements['prod-buy-price'].value = p.buy_price;
      form.elements['prod-sell-price'].value = p.sell_price;
      form.elements['prod-stock'].value = p.stock;
      form.elements['prod-unit'].value = p.unit || '';
    } else {
      title.textContent = 'Tambah Produk';
      form.reset();
    }

    modal.classList.remove('hidden');
    document.getElementById('prod-name').focus();
  }

  async function saveProduct(e) {
    e.preventDefault();
    const form = e.target;
    const data = {
      name: form.elements['prod-name'].value.trim(),
      barcode: form.elements['prod-barcode'].value.trim(),
      category: form.elements['prod-category'].value,
      buy_price: parseInt(form.elements['prod-buy-price'].value) || 0,
      sell_price: parseInt(form.elements['prod-sell-price'].value) || 0,
      stock: parseInt(form.elements['prod-stock'].value) || 0,
      unit: form.elements['prod-unit'].value.trim() || 'Pcs',
    };

    if (!data.name) { showToast('Nama produk wajib diisi', 'error'); return; }
    if (data.sell_price <= 0) { showToast('Harga jual harus lebih dari 0', 'error'); return; }

    try {
      if (editingId) {
        await KasirDB.update(KasirDB.STORES.PRODUCTS, { ...data, id: editingId, created_at: products.find(p => p.id === editingId)?.created_at });
        showToast('Produk diperbarui', 'success');
      } else {
        await KasirDB.add(KasirDB.STORES.PRODUCTS, { ...data, created_at: new Date().toISOString() });
        showToast('Produk ditambahkan', 'success');
      }
      products = await KasirDB.getAll(KasirDB.STORES.PRODUCTS);
      renderTable();
      closeModal('modal-produk');
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  }

  async function deleteProduct(id) {
    const prod = products.find(p => p.id === id);
    if (!prod) return;
    if (!confirm(`Hapus produk "${prod.name}"?`)) return;
    await KasirDB.remove(KasirDB.STORES.PRODUCTS, id);
    products = products.filter(p => p.id !== id);
    renderTable();
    showToast('Produk dihapus', 'warning');
  }

  async function adjustStock(id) {
    const prod = products.find(p => p.id === id);
    if (!prod) return;
    const newStock = prompt(`Stok saat ini: ${prod.stock} ${prod.unit || ''}\nMasukkan stok baru:`, prod.stock);
    if (newStock === null) return;
    const stockNum = parseInt(newStock);
    if (isNaN(stockNum) || stockNum < 0) { showToast('Stok tidak valid', 'error'); return; }
    await KasirDB.update(KasirDB.STORES.PRODUCTS, { ...prod, stock: stockNum });
    products = await KasirDB.getAll(KasirDB.STORES.PRODUCTS);
    renderTable();
    showToast(`Stok ${prod.name} diupdate: ${stockNum}`, 'success');
  }

  function exportCSV() {
    const headers = ['Nama', 'Barcode', 'Kategori', 'Harga Beli', 'Harga Jual', 'Stok', 'Satuan'];
    const rows = products.map(p => [p.name, p.barcode || '', p.category, p.buy_price, p.sell_price, p.stock, p.unit || 'Pcs'].join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'produk-kasir.csv';
    a.click(); URL.revokeObjectURL(url);
    showToast('Data produk diekspor', 'success');
  }

  function importCSV() {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.csv';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const text = await file.text();
      const lines = text.split('\n').slice(1).filter(l => l.trim());
      let added = 0;
      for (const line of lines) {
        const [name, barcode, category, buy_price, sell_price, stock, unit] = line.split(',');
        if (!name) continue;
        await KasirDB.add(KasirDB.STORES.PRODUCTS, {
          name: name.trim(), barcode: (barcode || '').trim(), category: (category || 'Lainnya').trim(),
          buy_price: parseInt(buy_price) || 0, sell_price: parseInt(sell_price) || 0,
          stock: parseInt(stock) || 0, unit: (unit || 'Pcs').trim(),
          created_at: new Date().toISOString(),
        });
        added++;
      }
      products = await KasirDB.getAll(KasirDB.STORES.PRODUCTS);
      renderTable();
      showToast(`${added} produk diimpor`, 'success');
    };
    input.click();
  }

  return { init };
})();
