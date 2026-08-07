/**
 * KasirDB - IndexedDB wrapper untuk aplikasi kasir offline
 */
const KasirDB = (() => {
  const DB_NAME = 'kasir_offline_db';
  const DB_VERSION = 1;
  let db = null;

  const STORES = {
    USERS: 'users',
    PRODUCTS: 'products',
    CATEGORIES: 'categories',
    TRANSACTIONS: 'transactions',
    TRANSACTION_ITEMS: 'transaction_items',
    SETTINGS: 'settings',
    HELD_ORDERS: 'held_orders',
  };

  // Inisialisasi database
  function init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;

        // Users store
        if (!db.objectStoreNames.contains(STORES.USERS)) {
          const userStore = db.createObjectStore(STORES.USERS, { keyPath: 'id', autoIncrement: true });
          userStore.createIndex('username', 'username', { unique: true });
        }

        // Products store
        if (!db.objectStoreNames.contains(STORES.PRODUCTS)) {
          const prodStore = db.createObjectStore(STORES.PRODUCTS, { keyPath: 'id', autoIncrement: true });
          prodStore.createIndex('barcode', 'barcode', { unique: false });
          prodStore.createIndex('category', 'category', { unique: false });
          prodStore.createIndex('name', 'name', { unique: false });
        }

        // Categories store
        if (!db.objectStoreNames.contains(STORES.CATEGORIES)) {
          db.createObjectStore(STORES.CATEGORIES, { keyPath: 'id', autoIncrement: true });
        }

        // Transactions store
        if (!db.objectStoreNames.contains(STORES.TRANSACTIONS)) {
          const txStore = db.createObjectStore(STORES.TRANSACTIONS, { keyPath: 'id', autoIncrement: true });
          txStore.createIndex('date', 'date', { unique: false });
          txStore.createIndex('invoice', 'invoice', { unique: true });
          txStore.createIndex('cashier_id', 'cashier_id', { unique: false });
        }

        // Transaction items store
        if (!db.objectStoreNames.contains(STORES.TRANSACTION_ITEMS)) {
          const itemStore = db.createObjectStore(STORES.TRANSACTION_ITEMS, { keyPath: 'id', autoIncrement: true });
          itemStore.createIndex('transaction_id', 'transaction_id', { unique: false });
        }

        // Settings store
        if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
          db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
        }

        // Held orders store
        if (!db.objectStoreNames.contains(STORES.HELD_ORDERS)) {
          db.createObjectStore(STORES.HELD_ORDERS, { keyPath: 'id', autoIncrement: true });
        }
      };

      request.onsuccess = (e) => {
        db = e.target.result;
        resolve(db);
      };

      request.onerror = (e) => {
        reject(e.target.error);
      };
    });
  }

  // Generic CRUD operations
  function getAll(storeName) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function getById(storeName, id) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function getByIndex(storeName, indexName, value) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const index = store.index(indexName);
      const request = index.getAll(value);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function add(storeName, data) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.add(data);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function update(storeName, data) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.put(data);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function remove(storeName, id) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.delete(id);
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }

  function getSetting(key) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.SETTINGS, 'readonly');
      const store = tx.objectStore(STORES.SETTINGS);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result ? request.result.value : null);
      request.onerror = () => reject(request.error);
    });
  }

  function setSetting(key, value) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.SETTINGS, 'readwrite');
      const store = tx.objectStore(STORES.SETTINGS);
      const request = store.put({ key, value });
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }

  // Seed data awal
  async function seedDefaultData() {
    // Cek apakah sudah ada user
    const users = await getAll(STORES.USERS);
    if (users.length === 0) {
      // Default admin
      await add(STORES.USERS, {
        username: 'admin',
        password: 'admin123',
        name: 'Administrator',
        role: 'admin',
        created_at: new Date().toISOString(),
      });
      // Default kasir
      await add(STORES.USERS, {
        username: 'kasir',
        password: 'kasir123',
        name: 'Kasir 1',
        role: 'kasir',
        created_at: new Date().toISOString(),
      });
    }

    // Cek kategori
    const cats = await getAll(STORES.CATEGORIES);
    if (cats.length === 0) {
      const defaultCats = ['Makanan', 'Minuman', 'Snack', 'Sembako', 'Lainnya'];
      for (const c of defaultCats) {
        await add(STORES.CATEGORIES, { name: c });
      }
    }

    // Cek setting toko
    const tokoName = await getSetting('toko_name');
    if (!tokoName) {
      await setSetting('toko_name', 'Toko Saya');
      await setSetting('toko_address', 'Jl. Contoh No. 1');
      await setSetting('toko_phone', '08123456789');
      await setSetting('printer_width', '58mm');
      await setSetting('footer_struk', 'Terima kasih sudah berbelanja!');
      await setSetting('show_profit', 'true');
    }

    // Cek produk contoh
    const prods = await getAll(STORES.PRODUCTS);
    if (prods.length === 0) {
      const sampleProducts = [
        { name: 'Aqua 600ml', barcode: '8996001303383', category: 'Minuman', buy_price: 2500, sell_price: 3500, stock: 100, unit: 'Botol' },
        { name: 'Indomie Goreng', barcode: '8999999021383', category: 'Makanan', buy_price: 2800, sell_price: 3500, stock: 50, unit: 'Bungkus' },
        { name: 'Teh Botol 450ml', barcode: '8999999011234', category: 'Minuman', buy_price: 4000, sell_price: 5000, stock: 60, unit: 'Botol' },
        { name: 'Chitato Sapi Panggang', barcode: '8999999031234', category: 'Snack', buy_price: 7000, sell_price: 9000, stock: 30, unit: 'Bungkus' },
        { name: 'Gula Pasir 1kg', barcode: '8999999041234', category: 'Sembako', buy_price: 14000, sell_price: 16000, stock: 25, unit: 'Kg' },
      ];
      for (const p of sampleProducts) {
        await add(STORES.PRODUCTS, { ...p, created_at: new Date().toISOString() });
      }
    }
  }

  // Ekspor semua data untuk backup
  async function exportAll() {
    return {
      users: await getAll(STORES.USERS),
      products: await getAll(STORES.PRODUCTS),
      categories: await getAll(STORES.CATEGORIES),
      transactions: await getAll(STORES.TRANSACTIONS),
      transaction_items: await getAll(STORES.TRANSACTION_ITEMS),
      settings: await getAll(STORES.SETTINGS),
      exported_at: new Date().toISOString(),
    };
  }

  // Generate nomor invoice
  async function generateInvoice() {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const transactions = await getAll(STORES.TRANSACTIONS);
    const todayTx = transactions.filter(t => t.date && t.date.startsWith(now.toISOString().slice(0, 10)));
    const seq = String(todayTx.length + 1).padStart(4, '0');
    return `INV-${dateStr}-${seq}`;
  }

  return {
    init,
    STORES,
    getAll,
    getById,
    getByIndex,
    add,
    update,
    remove,
    getSetting,
    setSetting,
    seedDefaultData,
    exportAll,
    generateInvoice,
  };
})();
