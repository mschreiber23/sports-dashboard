const CACHE_PREFIXES = ['sb_', 'tg_', 'ps2_'];

function storage() {
  if (typeof localStorage === 'undefined') return null;
  return localStorage;
}

function cacheKeys() {
  const store = storage();
  if (!store) return [];
  const keys = [];
  for (let i = 0; i < store.length; i += 1) {
    const key = store.key(i);
    if (key && CACHE_PREFIXES.some((prefix) => key.startsWith(prefix))) keys.push(key);
  }
  return keys;
}

export function readLocal(key) {
  try { return storage()?.getItem(key) ?? null; } catch { return null; }
}

export function evictStorageCaches() {
  const store = storage();
  if (!store) return;
  for (const key of cacheKeys()) {
    try { store.removeItem(key); } catch { /* keep going */ }
  }
}

export function rememberLocal(key, value) {
  const store = storage();
  if (!store) return false;
  try {
    store.setItem(key, value);
    return true;
  } catch {
    evictStorageCaches();
    try {
      store.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }
}
