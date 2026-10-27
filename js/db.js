// IndexedDB wrapper. Everything is stored on the device; nothing is sent anywhere.

export const STORES = ['habits', 'habitLogs', 'moods', 'categories', 'transactions', 'appointments', 'contacts', 'templates'];
const ALL = [...STORES, 'meta'];

let opened;

export function openDb() {
  if (!opened) {
    opened = new Promise((resolve, reject) => {
      const request = indexedDB.open('newroute', 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        ALL.forEach((name) => {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
        });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return opened;
}

const wrap = (request) => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const done = (tx) => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error);
  tx.onabort = () => reject(tx.error);
});

export async function getAll(store) {
  const db = await openDb();
  return wrap(db.transaction(store).objectStore(store).getAll());
}

export async function put(store, value) {
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(value);
  return done(tx);
}

export async function remove(store, id) {
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(id);
  return done(tx);
}

/** Removes the listed records in one transaction. */
export async function removeMany(store, ids) {
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  ids.forEach((id) => tx.objectStore(store).delete(id));
  return done(tx);
}

/** Clears the data stores and writes the given records, all in one transaction (all or nothing). */
export async function replaceAll(dataByStore) {
  const db = await openDb();
  const tx = db.transaction(STORES, 'readwrite');
  STORES.forEach((name) => {
    const store = tx.objectStore(name);
    store.clear();
    (dataByStore[name] || []).forEach((record) => store.put(record));
  });
  return done(tx);
}
