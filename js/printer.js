/**
 * Printer.js - Bluetooth Thermal Printer via Web Bluetooth API
 * Format ESC/POS untuk 58mm / 80mm printer
 */
const Printer = (() => {
  let device = null;
  let characteristic = null;
  let onStatusChangeCallback = null;

  // ESC/POS Commands
  const ESC = 0x1B;
  const GS  = 0x1D;
  const CMD = {
    INIT:         [ESC, 0x40],
    ALIGN_LEFT:   [ESC, 0x61, 0x00],
    ALIGN_CENTER: [ESC, 0x61, 0x01],
    ALIGN_RIGHT:  [ESC, 0x61, 0x02],
    BOLD_ON:      [ESC, 0x45, 0x01],
    BOLD_OFF:     [ESC, 0x45, 0x00],
    FONT_NORMAL:  [ESC, 0x21, 0x00],
    FONT_LARGE:   [GS,  0x21, 0x11], // Double width & height yang lebih kompatibel
    CUT:          [GS,  0x56, 0x01],
    FEED_3:       [ESC, 0x64, 0x03],
    FEED_LINE:    [0x0A],
  };

  // List of known thermal printer BLE service UUIDs
  const KNOWN_SERVICES = [
    '000018f0-0000-1000-8000-00805f9b34fb',
    '49535343-fe7d-4ae5-8fa9-9fafd205e455',
    'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
    '0000e7b0-0000-1000-8000-00805f9b34fb',
    '0000ff00-0000-1000-8000-00805f9b34fb',
    '0000fee7-0000-1000-8000-00805f9b34fb',
    '0000ae00-0000-1000-8000-00805f9b34fb',
    '0000ff02-0000-1000-8000-00805f9b34fb',
    0x18f0,
    0xff00,
    0xe7b0,
    0xfee7,
    0xae00
  ];

  // Layanan standar Bluetooth non-printer yang harus dihindari saat mencari jalur tulis
  const IGNORE_SERVICES = [
    '00001800-0000-1000-8000-00805f9b34fb', // Generic Access
    '00001801-0000-1000-8000-00805f9b34fb', // Generic Attribute
    '0000180a-0000-1000-8000-00805f9b34fb', // Device Information
    '0000180f-0000-1000-8000-00805f9b34fb', // Battery Service
  ];

  function strToBytes(str) {
    if (!str) return [];
    const bytes = [];
    const s = String(str);
    for (let i = 0; i < s.length; i++) {
      let code = s.charCodeAt(i);
      // Map non-standard quote/dash characters to standard ASCII
      if (code === 8216 || code === 8217) code = 39; // '
      else if (code === 8220 || code === 8221) code = 34; // "
      else if (code === 8211 || code === 8212) code = 45; // -
      
      if (code >= 32 && code <= 126) {
        bytes.push(code);
      } else if (code === 10) {
        bytes.push(0x0A); // newline
      } else {
        bytes.push(0x20); // replace unknown with space
      }
    }
    return bytes;
  }

  function padRight(str, len) {
    return String(str || '').padEnd(len, ' ').slice(0, len);
  }

  function padLeft(str, len) {
    return String(str || '').padStart(len, ' ').slice(-len);
  }

  function formatLine(left, right, width) {
    const rightStr = String(right || '');
    const maxLeftLen = Math.max(0, width - rightStr.length - 1);
    const leftStr = String(left || '').slice(0, maxLeftLen);
    return leftStr.padEnd(width - rightStr.length, ' ') + rightStr;
  }

  function onStatusChange(callback) {
    onStatusChangeCallback = callback;
  }

  function notifyStatusChange() {
    if (typeof onStatusChangeCallback === 'function') {
      onStatusChangeCallback(isConnected(), getDeviceName());
    }
  }

  async function connect() {
    if (!navigator.bluetooth) {
      return {
        success: false,
        error: 'Web Bluetooth tidak didukung di browser ini. Gunakan Google Chrome pada Android/Desktop melalui HTTPS atau localhost.'
      };
    }

    try {
      device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: KNOWN_SERVICES,
      });

      device.addEventListener('gattserverdisconnected', () => {
        characteristic = null;
        notifyStatusChange();
      });

      const server = await device.gatt.connect();

      // Scan services & characteristics for a writable channel
      let charFound = null;
      let fallbackChar = null;

      try {
        const services = await server.getPrimaryServices();
        for (const service of services) {
          const serviceUuid = service.uuid.toLowerCase();
          const isIgnored = IGNORE_SERVICES.some(ign => serviceUuid.includes(ign));
          
          try {
            const chars = await service.getCharacteristics();
            for (const c of chars) {
              const canWrite = c.properties.write || c.properties.writeWithoutResponse;
              if (canWrite) {
                if (!isIgnored && !charFound) {
                  charFound = c;
                  break;
                } else if (!fallbackChar) {
                  fallbackChar = c;
                }
              }
            }
          } catch (e) {
            console.warn('Gagal membaca karakteristik service:', serviceUuid, e);
          }
          if (charFound) break;
        }
      } catch (e) {
        console.warn('Gagal scan primary services:', e);
      }

      // Fallback standard 18F0 service jika scan otomatis belum menemukan
      if (!charFound && !fallbackChar) {
        try {
          const service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
          charFound = await service.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb');
        } catch (e) {}
      }

      characteristic = charFound || fallbackChar;

      if (!characteristic) {
        throw new Error('Gagal menemukan jalur tulis printer Bluetooth. Pastikan izin Bluetooth aktif.');
      }

      notifyStatusChange();
      return { success: true, name: device.name || 'Thermal Printer' };
    } catch (err) {
      notifyStatusChange();
      return { success: false, error: err.message || 'Koneksi dibatalkan' };
    }
  }

  async function disconnect() {
    try {
      if (device && device.gatt && device.gatt.connected) {
        device.gatt.disconnect();
      }
    } catch (e) {}
    device = null;
    characteristic = null;
    notifyStatusChange();
  }

  function isConnected() {
    return !!(device && device.gatt && device.gatt.connected && characteristic);
  }

  function getDeviceName() {
    return (device && device.name) || 'Printer Bluetooth';
  }

  async function printData(bytes) {
    if (!isConnected()) throw new Error('Printer tidak terhubung');
    
    // BLE MTU payload standard adalah 20 bytes.
    // Mengirim lebih dari 20 bytes sekaligus sering membuat buffer printer BLE overflow
    // sehingga printer hanya bunyi / beep tapi tidak mencetak data.
    const CHUNK = 20; 
    
    for (let i = 0; i < bytes.length; i += CHUNK) {
      const dataChunk = new Uint8Array(bytes.slice(i, i + CHUNK));
      try {
        if (characteristic.properties.writeWithoutResponse && typeof characteristic.writeValueWithoutResponse === 'function') {
          await characteristic.writeValueWithoutResponse(dataChunk);
        } else if (typeof characteristic.writeValueWithResponse === 'function') {
          await characteristic.writeValueWithResponse(dataChunk);
        } else {
          await characteristic.writeValue(dataChunk);
        }
      } catch (err) {
        // Fallback untuk browser versi terdahulu
        try {
          await characteristic.writeValue(dataChunk);
        } catch (innerErr) {
          console.error('Error saat mengirim data ke printer:', innerErr);
          throw innerErr;
        }
      }
      // Jeda 20ms agar buffer mikrokontroler printer sempat memproses
      await new Promise(r => setTimeout(r, 20));
    }
  }

  function buildStrukBytes(data, settings) {
    settings = settings || {};
    const width = settings.printer_width === '80mm' ? 48 : 32;
    let bytes = [];

    const push = (...cmds) => cmds.forEach(c => bytes.push(...c));
    const text = (str) => { bytes.push(...strToBytes(str)); };
    const newline = () => bytes.push(0x0A);
    const line = () => { text('-'.repeat(width)); newline(); };

    push(CMD.INIT, CMD.ALIGN_CENTER);

    // Header - nama toko
    push(CMD.BOLD_ON, CMD.FONT_LARGE);
    text(data.toko_name || 'TOKO SAYA'); newline();
    push(CMD.FONT_NORMAL, CMD.BOLD_OFF);
    if (data.toko_address) { text(data.toko_address); newline(); }
    if (data.toko_phone) { text('Telp: ' + data.toko_phone); newline(); }

    line();
    push(CMD.ALIGN_LEFT);

    // Info transaksi
    text('Invoice : ' + (data.invoice || '')); newline();
    text('Kasir   : ' + (data.cashier_name || '')); newline();
    text('Tanggal : ' + (data.date_str || '')); newline();
    text('Bayar   : ' + (data.payment_method || '')); newline();
    line();

    // Header kolom
    if (width >= 48) {
      text(padRight('Produk', 24) + padLeft('Qty', 4) + padLeft('@Harga', 10) + padLeft('Total', 10));
    } else {
      text(padRight('Produk', width)); newline();
    }
    newline(); line();

    // Item
    const items = data.items || [];
    for (const item of items) {
      const subtotal = item.qty * item.price;
      const discAmt = item.discount ? Math.round(subtotal * item.discount / 100) : 0;
      const total = subtotal - discAmt;

      if (width >= 48) {
        text(padRight(item.name, 24) + padLeft(item.qty, 4) + padLeft(formatRp(item.price), 10) + padLeft(formatRp(total), 10));
        newline();
        if (discAmt > 0) {
          text(padRight('  Diskon ' + item.discount + '%', 28) + padLeft('-' + formatRp(discAmt), 20));
          newline();
        }
      } else {
        text(item.name.slice(0, width)); newline();
        const qtyPrice = item.qty + ' x ' + formatRp(item.price);
        text('  ' + formatLine(qtyPrice, formatRp(total), width - 2)); newline();
        if (discAmt > 0) {
          text('  ' + formatLine('Diskon ' + item.discount + '%', '-' + formatRp(discAmt), width - 2)); newline();
        }
      }
    }

    line();

    // Total
    push(CMD.BOLD_ON);
    text(formatLine('SUBTOTAL', formatRp(data.subtotal || 0), width)); newline();
    if (data.discount_total > 0) {
      text(formatLine('DISKON', '-' + formatRp(data.discount_total), width)); newline();
    }
    push(CMD.FONT_LARGE);
    text(formatLine('TOTAL', formatRp(data.total || 0), width)); newline();
    push(CMD.FONT_NORMAL, CMD.BOLD_OFF);

    if (data.payment_method === 'Tunai') {
      text(formatLine('BAYAR', formatRp(data.paid || 0), width)); newline();
      text(formatLine('KEMBALI', formatRp(data.change || 0), width)); newline();
    }

    line();

    // Footer
    push(CMD.ALIGN_CENTER);
    text(data.footer || 'Terima kasih sudah berbelanja!'); newline();
    
    // Feed baris kosong di akhir agar struk mudah disobek
    push(CMD.FEED_LINE, CMD.FEED_LINE, CMD.FEED_LINE, CMD.FEED_LINE);
    
    // Potong kertas (hanya jika printer 80mm yang umumnya punya auto cutter)
    if (settings.printer_width === '80mm') {
      push(CMD.CUT);
    }

    return bytes;
  }

  async function printStruk(data, settings) {
    if (isConnected()) {
      try {
        const bytes = buildStrukBytes(data, settings);
        await printData(bytes);
        return { success: true, method: 'bluetooth' };
      } catch (err) {
        console.error('Gagal mencetak via bluetooth, fallback ke browser:', err);
        // Jika koneksi bluetooth error di tengah cetak, fallback ke browser
        previewAndPrint(data, settings);
        return { success: false, error: err.message, method: 'browser' };
      }
    } else {
      // Fallback: browser print dialog
      previewAndPrint(data, settings);
      return { success: true, method: 'browser' };
    }
  }

  async function testPrint(settings) {
    const now = new Date();
    const testData = {
      toko_name: settings?.toko_name || 'KasirPro Test',
      toko_address: settings?.toko_address || 'Printer Bluetooth Siap Digunakan',
      toko_phone: settings?.toko_phone || '',
      invoice: 'TEST-' + now.toTimeString().slice(0, 8).replace(/:/g, ''),
      cashier_name: 'Kasir',
      date_str: now.toLocaleString('id-ID'),
      payment_method: 'TUNAI',
      items: [
        { name: 'Tes Cetak Baris 1', qty: 1, price: 1000, discount: 0 },
        { name: 'Tes Cetak Baris 2', qty: 2, price: 2500, discount: 10 }
      ],
      subtotal: 6000,
      discount_total: 500,
      total: 5500,
      paid: 10000,
      change: 4500,
      footer: 'Koneksi Printer Bluetooth Berhasil!'
    };
    return await printStruk(testData, settings);
  }

  function previewAndPrint(data, settings) {
    const width = settings?.printer_width === '80mm' ? '80mm' : '58mm';
    const html = generateStrukHTML(data, settings);
    const win = window.open('', '_blank', 'width=400,height=600');
    if (!win) {
      alert('Popup diblokir oleh browser. Izinkan popup untuk mencetak struk via browser.');
      return;
    }
    win.document.write(`
      <!DOCTYPE html><html><head>
        <meta charset="UTF-8">
        <title>Struk ${data.invoice || 'Kasir'}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: monospace; font-size: 12px; width: ${width}; padding: 4px; }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .large { font-size: 15px; font-weight: bold; }
          .line { border-top: 1px dashed #000; margin: 4px 0; }
          .row { display: flex; justify-content: space-between; }
          .item-name { font-weight: bold; }
          @media print { body { width: 100%; } }
        </style>
      </head><body>${html}</body></html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  }

  function generateStrukHTML(data, settings) {
    const items = (data.items || []).map(item => {
      const subtotal = item.qty * item.price;
      const discAmt = item.discount ? Math.round(subtotal * item.discount / 100) : 0;
      const total = subtotal - discAmt;
      return `
        <div class="item-name">${item.name}</div>
        <div class="row"><span>${item.qty} x ${formatRp(item.price)}</span><span>${formatRp(total)}</span></div>
        ${discAmt > 0 ? `<div class="row"><span style="color:#999">Diskon ${item.discount}%</span><span style="color:#999">-${formatRp(discAmt)}</span></div>` : ''}
      `;
    }).join('');

    return `
      <div class="center">
        <div class="large">${data.toko_name || 'TOKO SAYA'}</div>
        <div>${data.toko_address || ''}</div>
        ${data.toko_phone ? `<div>Telp: ${data.toko_phone}</div>` : ''}
      </div>
      <div class="line"></div>
      <div>Invoice : ${data.invoice || ''}</div>
      <div>Kasir   : ${data.cashier_name || ''}</div>
      <div>Tanggal : ${data.date_str || ''}</div>
      <div>Bayar   : ${data.payment_method || ''}</div>
      <div class="line"></div>
      ${items}
      <div class="line"></div>
      <div class="row"><span>Subtotal</span><span>${formatRp(data.subtotal || 0)}</span></div>
      ${data.discount_total > 0 ? `<div class="row"><span>Diskon</span><span>-${formatRp(data.discount_total)}</span></div>` : ''}
      <div class="row bold large"><span>TOTAL</span><span>${formatRp(data.total || 0)}</span></div>
      ${data.payment_method === 'Tunai' ? `
        <div class="row"><span>Bayar</span><span>${formatRp(data.paid || 0)}</span></div>
        <div class="row bold"><span>Kembali</span><span>${formatRp(data.change || 0)}</span></div>
      ` : ''}
      <div class="line"></div>
      <div class="center">${data.footer || 'Terima kasih sudah berbelanja!'}</div>
    `;
  }

  function formatRp(n) {
    return new Intl.NumberFormat('id-ID').format(n || 0);
  }

  return {
    connect,
    disconnect,
    isConnected,
    getDeviceName,
    onStatusChange,
    notifyStatusChange,
    printStruk,
    testPrint,
    generateStrukHTML,
    formatRp
  };
})();
