/**
 * IndexedDB Database Layer
 * IELTS Listening Trainer — manages all persistent storage.
 */

const DB_NAME = 'ielts_trainer_v1';
const DB_VERSION = 1;

let db = null;

/** Open (or create) the database and return a promise */
export function openDB() {
  return new Promise((resolve, reject) => {
    if (db) return resolve(db);

    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const d = e.target.result;

      // ── Questions store (题库索引) ──
      if (!d.objectStoreNames.contains('questions')) {
        const qStore = d.createObjectStore('questions', { keyPath: 'id' });
        qStore.createIndex('part', 'part', { unique: false });
        qStore.createIndex('frequency', 'frequency', { unique: false });
        qStore.createIndex('cambridge', 'cambridge', { unique: false });
      }

      // ── Progress store (用户学习数据) ──
      if (!d.objectStoreNames.contains('progress')) {
        const pStore = d.createObjectStore('progress', { keyPath: 'questionId' });
        pStore.createIndex('completed', 'completed', { unique: false });
        pStore.createIndex('accuracy', 'accuracy', { unique: false });
        pStore.createIndex('lastPractice', 'lastPractice', { unique: false });
        pStore.createIndex('favorite', 'favorite', { unique: false });
        pStore.createIndex('learningStatus', 'learningStatus', { unique: false });
      }

      // ── Settings store ──
      if (!d.objectStoreNames.contains('settings')) {
        d.createObjectStore('settings', { keyPath: 'key' });
      }
    };

    req.onsuccess = (e) => {
      db = e.target.result;
      resolve(db);
    };

    req.onerror = () => reject(req.error);
  });
}

/** Generic get-all from a store */
export function getAll(storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Get single record by key */
export function getOne(storeName, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Put one record (insert or update) */
export function putOne(storeName, record) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.put(record);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Bulk put — wraps in a single transaction */
export function putAll(storeName, records) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    records.forEach(r => store.put(r));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Count records in a store */
export function count(storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Delete a record by key */
export function deleteOne(storeName, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/** Clear all records from a store */
export function clearStore(storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/** Get by index */
export function getByIndex(storeName, indexName, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const index = store.index(indexName);
    const req = index.getAll(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
