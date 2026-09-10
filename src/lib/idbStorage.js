/**
 * IndexedDB-backed storage adapter for Supabase auth.
 *
 * iOS Safari PWA can silently clear localStorage when the app is force-closed.
 * IndexedDB has much stronger persistence in iOS standalone mode, so we use
 * it to store the Supabase session token instead.
 *
 * Supabase JS v2 supports async storage — getItem / setItem / removeItem
 * can return Promises.
 */

const DB_NAME  = 'shribely_db';
const STORE    = 'kv';
const VERSION  = 1;

let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = e => {
      e.target.result.createObjectStore(STORE);
    };
    req.onsuccess = e => {
      _db = e.target.result;
      resolve(_db);
    };
    req.onerror = e => reject(e.target.error);
  });
}

async function run(mode, fn) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror   = e => reject(e.target.error);
    });
  } catch {
    return null;
  }
}

export const idbStorage = {
  getItem:    key        => run('readonly',  s => s.get(key)),
  setItem:    (key, val) => run('readwrite', s => s.put(val, key)),
  removeItem: key        => run('readwrite', s => s.delete(key)),
};
