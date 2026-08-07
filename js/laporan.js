/**
 * Laporan.js - Laporan penjualan & statistik
 */
const Laporan = (() => {
  const fmt = (n) => new Intl.NumberFormat('id-ID').format(n);

  async function init() {
    const today = new Date().toISOString().slice(0, 10);
    document.getElementById('laporan-dari').value = today;
    document.getElementById('laporan-sampai').value = today;
    await load();
    bindEvents();
  }

  function bindEvents() {
    document.getElementById('btn-filter-laporan')?.addEventListener('click', load);
    document.getElementById('btn-export-pdf')?.addEventListener('click', exportPDF);
    document.getElementById('laporan-preset')?.addEventListener('change', function () {
      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      let dari = today, sampai = today;

      if (this.value === 'week') {
        const d = new Date(); d.setDate(d.getDate() - 6);
        dari = d.toISOString().slice(0, 10);
      } else if (this.value === 'month') {
        dari = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
        sampai = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
      } else if (this.value === 'last_month') {
        dari = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
        sampai = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10);
      }

      document.getElementById('laporan-dari').value = dari;
      document.getElementById('laporan-sampai').value = sampai;
      load();
    });
  }

  async function load() {
    const dari   = document.getElementById('laporan-dari')?.value;
    const sampai = document.getElementById('laporan-sampai')?.value;

    const allTx = await KasirDB.getAll(KasirDB.STORES.TRANSACTIONS);
    const allItems = await KasirDB.getAll(KasirDB.STORES.TRANSACTION_ITEMS);

    const filtered = allTx.filter(tx => {
      const tgl = tx.date?.slice(0, 10);
      return (!dari || tgl >= dari) && (!sampai || tgl <= sampai);
    });

    // Stats
    const omzet = filtered.reduce((s, tx) => s + (tx.total || 0), 0);
    const txCount = filtered.length;
    const itemCount = filtered.reduce((s, tx) => s + (tx.items_count || 0), 0);

    // Hitung keuntungan
    const filteredItemIds = new Set(filtered.map(t => t.id));
    const filteredItems = allItems.filter(i => filteredItemIds.has(i.transaction_id));
    const products = await KasirDB.getAll(KasirDB.STORES.PRODUCTS);
    let totalCost = 0;
    for (const item of filteredItems) {
      const prod = products.find(p => p.id === item.product_id);
      if (prod) totalCost += prod.buy_price * item.qty;
    }
    const profit = omzet - totalCost;

    // Update stats
    document.getElementById('stat-omzet').textContent = 'Rp ' + fmt(omzet);
    document.getElementById('stat-profit').textContent = 'Rp ' + fmt(profit);
    document.getElementById('stat-tx-count').textContent = txCount;
    document.getElementById('stat-item-count').textContent = itemCount;

    // Riwayat transaksi
    renderTransactions(filtered);

    // Produk terlaris
    renderTopProducts(filteredItems);

    // Grafik sederhana per hari
    renderDailyChart(filtered, dari, sampai);
  }

  function renderTransactions(txList) {
    const tbody = document.getElementById('tx-tbody');
    const sorted = [...txList].sort((a, b) => new Date(b.date) - new Date(a.date));

    if (sorted.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-muted)">Tidak ada transaksi</td></tr>`;
      return;
    }

    tbody.innerHTML = sorted.slice(0, 100).map(tx => {
      const payBadge = {
        'Tunai': 'badge-success', 'QRIS': 'badge-info', 'Transfer': 'badge-warning'
      }[tx.payment_method] || 'badge-accent';

      return `
        <tr>
          <td class="text-xs text-muted">${tx.invoice}</td>
          <td>${new Date(tx.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
          <td class="text-xs">${new Date(tx.date).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</td>
          <td>${tx.cashier_name || '—'}</td>
          <td><span class="badge ${payBadge}">${tx.payment_method}</span></td>
          <td class="text-success fw-700">Rp ${fmt(tx.total)}</td>
          <td>
            <button class="btn btn-ghost btn-sm btn-detail-tx" data-id="${tx.id}" title="Detail">🔍</button>
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.btn-detail-tx').forEach(b => {
      b.addEventListener('click', () => openTxDetail(parseInt(b.dataset.id), txList));
    });
  }

  async function openTxDetail(txId, txList) {
    const tx = txList.find(t => t.id === txId);
    if (!tx) return;
    const items = await KasirDB.getByIndex(KasirDB.STORES.TRANSACTION_ITEMS, 'transaction_id', txId);
    const modal = document.getElementById('modal-tx-detail');
    modal.classList.remove('hidden');

    document.getElementById('tx-detail-invoice').textContent = tx.invoice;
    document.getElementById('tx-detail-body').innerHTML = `
      <div class="grid-2 mb-4">
        <div><div class="text-xs text-muted">Tanggal</div><div>${new Date(tx.date).toLocaleString('id-ID')}</div></div>
        <div><div class="text-xs text-muted">Kasir</div><div>${tx.cashier_name}</div></div>
        <div><div class="text-xs text-muted">Metode Bayar</div><div>${tx.payment_method}</div></div>
        <div><div class="text-xs text-muted">Jumlah Item</div><div>${tx.items_count} item</div></div>
      </div>
      <table>
        <thead><tr><th>Produk</th><th>Qty</th><th>Harga</th><th>Total</th></tr></thead>
        <tbody>
          ${items.map(i => `<tr>
            <td>${i.name}</td><td>${i.qty}</td>
            <td>Rp ${fmt(i.price)}</td>
            <td class="text-success">Rp ${fmt(i.subtotal)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <div style="margin-top:16px;border-top:1px solid var(--border);padding-top:12px">
        <div class="summary-row"><span>Subtotal</span><span>Rp ${fmt(tx.subtotal)}</span></div>
        ${tx.discount_total > 0 ? `<div class="summary-row text-danger"><span>Diskon</span><span>-Rp ${fmt(tx.discount_total)}</span></div>` : ''}
        <div class="summary-row fw-700" style="font-size:16px"><span>Total</span><span class="text-success">Rp ${fmt(tx.total)}</span></div>
        ${tx.payment_method === 'Tunai' ? `
          <div class="summary-row"><span>Bayar</span><span>Rp ${fmt(tx.paid)}</span></div>
          <div class="summary-row"><span>Kembali</span><span>Rp ${fmt(tx.change)}</span></div>
        ` : ''}
      </div>
    `;

    document.getElementById('btn-close-tx-detail')?.addEventListener('click', () => closeModal('modal-tx-detail'));

    // Reprint
    document.getElementById('btn-reprint')?.addEventListener('click', async () => {
      const settings = {
        toko_name: await KasirDB.getSetting('toko_name') || 'Toko Saya',
        toko_address: await KasirDB.getSetting('toko_address'),
        toko_phone: await KasirDB.getSetting('toko_phone'),
        printer_width: await KasirDB.getSetting('printer_width') || '58mm',
        footer: await KasirDB.getSetting('footer_struk'),
      };
      await Printer.printStruk({
        ...settings, invoice: tx.invoice, cashier_name: tx.cashier_name,
        date_str: new Date(tx.date).toLocaleString('id-ID'),
        payment_method: tx.payment_method, items,
        subtotal: tx.subtotal, discount_total: tx.discount_total,
        total: tx.total, paid: tx.paid, change: tx.change,
      }, settings);
    });
  }

  function renderTopProducts(items) {
    const productSales = {};
    for (const item of items) {
      if (!productSales[item.name]) productSales[item.name] = { qty: 0, revenue: 0 };
      productSales[item.name].qty += item.qty;
      productSales[item.name].revenue += item.subtotal;
    }

    const sorted = Object.entries(productSales).sort((a, b) => b[1].qty - a[1].qty).slice(0, 5);
    const el = document.getElementById('top-products-list');

    if (sorted.length === 0) {
      el.innerHTML = '<div class="text-muted text-sm" style="padding:16px;text-align:center">Belum ada data</div>';
      return;
    }

    const maxQty = sorted[0]?.[1].qty || 1;
    el.innerHTML = sorted.map(([name, data], i) => `
      <div style="margin-bottom:12px">
        <div class="flex justify-between mb-4">
          <span class="text-sm">${i + 1}. ${name}</span>
          <span class="text-sm text-success">${data.qty} terjual</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width:${Math.round(data.qty / maxQty * 100)}%"></div>
        </div>
      </div>
    `).join('');
  }

  function renderDailyChart(txList, dari, sampai) {
    const el = document.getElementById('daily-chart');
    if (!el || !dari || !sampai) return;

    // Group by date
    const byDate = {};
    for (const tx of txList) {
      const d = tx.date?.slice(0, 10);
      if (!d) continue;
      byDate[d] = (byDate[d] || 0) + (tx.total || 0);
    }

    const dates = Object.keys(byDate).sort();
    if (dates.length === 0) {
      el.innerHTML = '<div class="text-muted text-sm" style="text-align:center;padding:24px">Belum ada data untuk ditampilkan</div>';
      return;
    }

    const maxVal = Math.max(...Object.values(byDate));
    el.innerHTML = `
      <div style="display:flex;align-items:flex-end;gap:6px;height:120px;padding:0 4px">
        ${dates.map(d => {
          const h = Math.round((byDate[d] / maxVal) * 100);
          return `
            <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;min-width:0" title="${d}: Rp ${fmt(byDate[d])}">
              <div style="width:100%;background:linear-gradient(180deg,var(--accent-light),var(--accent));border-radius:4px 4px 0 0;height:${h}%;min-height:4px;transition:height 0.5s ease"></div>
              <div class="text-xs text-muted" style="writing-mode:vertical-rl;text-orientation:mixed;font-size:9px">${d.slice(5)}</div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function exportPDF() {
    window.print();
  }

  return { init };
})();
