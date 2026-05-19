const DB_NAME = 'mystats';
const DB_VERSION = 2;

let db;

export function initDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('workouts')) {
        const ws = d.createObjectStore('workouts', { keyPath: 'id', autoIncrement: true });
        ws.createIndex('date', 'date');
      }
      if (!d.objectStoreNames.contains('runs')) {
        const rs = d.createObjectStore('runs', { keyPath: 'id', autoIncrement: true });
        rs.createIndex('date', 'date');
      }
      if (!d.objectStoreNames.contains('bodyscans')) {
        const bs = d.createObjectStore('bodyscans', { keyPath: 'id', autoIncrement: true });
        bs.createIndex('date', 'date');
      }
      if (!d.objectStoreNames.contains('checklist')) {
        d.createObjectStore('checklist', { keyPath: 'date' });
      }
      if (!d.objectStoreNames.contains('settings')) {
        d.createObjectStore('settings', { keyPath: 'key' });
      }
      if (!d.objectStoreNames.contains('reminders')) {
        d.createObjectStore('reminders', { keyPath: 'id', autoIncrement: true });
      }
      if (!d.objectStoreNames.contains('bloodwork')) {
        const bw = d.createObjectStore('bloodwork', { keyPath: 'id', autoIncrement: true });
        bw.createIndex('date', 'date');
      }
    };
    req.onsuccess = e => { db = e.target.result; resolve(db); };
    req.onerror = () => reject(req.error);
  });
}

function tx(store, mode = 'readonly') {
  return db.transaction(store, mode).objectStore(store);
}

export function dbAdd(store, data) {
  return new Promise((resolve, reject) => {
    const req = tx(store, 'readwrite').add(data);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function dbPut(store, data) {
  return new Promise((resolve, reject) => {
    const req = tx(store, 'readwrite').put(data);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function dbGet(store, key) {
  return new Promise((resolve, reject) => {
    const req = tx(store).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function dbGetAll(store) {
  return new Promise((resolve, reject) => {
    const req = tx(store).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function dbDelete(store, key) {
  return new Promise((resolve, reject) => {
    const req = tx(store, 'readwrite').delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export function dbClear(store) {
  return new Promise((resolve, reject) => {
    const req = tx(store, 'readwrite').clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function dbGetByIndex(store, index, value) {
  return new Promise((resolve, reject) => {
    const req = tx(store).index(index).getAll(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
