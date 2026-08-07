/**
 * Pengaturan.js - Pengaturan toko, printer, backup/restore
 */
const Pengaturan = (() => {
  async function init() {
    await loadSettings();
    bindEvents();
    if (typeof updateAllPrinterUI === 'function') updateAllPrinterUI();
  }

  async function loadSettings() {
    const keys = ['toko_name', 'toko_address', 'toko_phone', 'printer_width', 'footer_struk', 'show_profit'];
    for (const key of keys) {
      const val = await KasirDB.getSetting(key);
      const el = document.getElementById('set-' + key.replace(/_/g, '-'));
      if (el) {
        if (el.type === 'checkbox') el.checked = val === 'true';
        else el.value = val || '';
      }
    }
  }

  function bindEvents() {
    // Simpan pengaturan
    document.getElementById('btn-save-settings')?.addEventListener('click', saveSettings);

    // Backup
    document.getElementById('btn-backup')?.addEventListener('click', backup);

    // Restore
    document.getElementById('btn-restore')?.addEventListener('click', () => {
      document.getElementById('restore-file').click();
    });
    document.getElementById('restore-file')?.addEventListener('change', restore);

    // Reset data
    document.getElementById('btn-reset')?.addEventListener('click', resetData);
  }

  async function saveSettings() {
    const fields = {
      'toko_name':     document.getElementById('set-toko-name')?.value,
      'toko_address':  document.getElementById('set-toko-address')?.value,
      'toko_phone':    document.getElementById('set-toko-phone')?.value,
      'printer_width': document.getElementById('set-printer-width')?.value,
      'footer_struk':  document.getElementById('set-footer-struk')?.value,
      'show_profit':   String(document.getElementById('set-show-profit')?.checked || false),
    };

    for (const [key, val] of Object.entries(fields)) {
      if (val !== undefined) await KasirDB.setSetting(key, val);
    }

    showToast('Pengaturan disimpan ✓', 'success');
  }

  async function backup() {
    const data = await KasirDB.exportAll();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);
    a.href = url; a.download = `backup-kasir-${date}.json`;
    a.click(); URL.revokeObjectURL(url);
    showToast('Backup berhasil didownload', 'success');
  }

  async function restore(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (!confirm('⚠️ Restore akan MENIMPA semua data saat ini. Lanjutkan?')) {
      e.target.value = '';
      return;
    }

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      const stores = [
        [KasirDB.STORES.PRODUCTS, data.products],
        [KasirDB.STORES.CATEGORIES, data.categories],
        [KasirDB.STORES.TRANSACTIONS, data.transactions],
        [KasirDB.STORES.TRANSACTION_ITEMS, data.transaction_items],
      ];

      for (const [store, items] of stores) {
        if (!items) continue;
        for (const item of items) {
          try { await KasirDB.update(store, item); } catch { await KasirDB.add(store, item); }
        }
      }

      if (data.settings) {
        for (const s of data.settings) {
          await KasirDB.setSetting(s.key, s.value);
        }
      }

      showToast('Data berhasil direstore! Reload halaman.', 'success', 5000);
      setTimeout(() => location.reload(), 3000);
    } catch (err) {
      showToast('File backup tidak valid', 'error');
    }
    e.target.value = '';
  }

  async function resetData() {
    const confirm1 = confirm('⚠️ RESET akan menghapus SEMUA data transaksi.\n\nLanjutkan?');
    if (!confirm1) return;
    const confirm2 = prompt('Ketik "RESET" untuk konfirmasi:');
    if (confirm2 !== 'RESET') { showToast('Reset dibatalkan', 'info'); return; }

    const txs = await KasirDB.getAll(KasirDB.STORES.TRANSACTIONS);
    for (const tx of txs) await KasirDB.remove(KasirDB.STORES.TRANSACTIONS, tx.id);
    const items = await KasirDB.getAll(KasirDB.STORES.TRANSACTION_ITEMS);
    for (const item of items) await KasirDB.remove(KasirDB.STORES.TRANSACTION_ITEMS, item.id);

    showToast('Data transaksi dihapus', 'warning');
    setTimeout(() => location.reload(), 1500);
  }

  return { init };
})();
