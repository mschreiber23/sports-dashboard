import test from 'node:test';
import assert from 'node:assert/strict';
import { evictStorageCaches, readLocal, rememberLocal } from './localStore.js';

function installStore(seed, throwsLeft) {
  const store = new Map(seed);
  let remaining = throwsLeft;
  globalThis.localStorage = {
    get length() { return store.size; },
    key(index) { return [...store.keys()][index] ?? null; },
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) {
      if (remaining > 0) {
        remaining -= 1;
        const error = new Error('The quota has been exceeded.');
        error.name = 'QuotaExceededError';
        throw error;
      }
      store.set(key, String(value));
    },
    removeItem(key) { store.delete(key); },
  };
  return store;
}

test('a full store drops score caches and still remembers the team', () => {
  const store = installStore([
    ['sb_nhl_20261114', 'scoreboard'],
    ['tg_nhl_6_20261114', 'schedule'],
    ['ps2_nhl_1_2027', 'stats'],
    ['sports_dashboard_favorites_v4', '{"teams":[]}'],
  ], 1);
  assert.equal(rememberLocal('team_stats_sport', 'nhl'), true);
  assert.equal(store.has('sb_nhl_20261114'), false);
  assert.equal(store.has('tg_nhl_6_20261114'), false);
  assert.equal(store.has('ps2_nhl_1_2027'), false);
  assert.equal(store.get('sports_dashboard_favorites_v4'), '{"teams":[]}');
  assert.equal(readLocal('team_stats_sport'), 'nhl');
});

test('a store that stays full does not throw', () => {
  installStore([['sb_nhl_20261114', 'scoreboard']], 5);
  assert.equal(rememberLocal('team_stats_sport', 'nhl'), false);
  assert.equal(evictStorageCaches() || true, true);
});
