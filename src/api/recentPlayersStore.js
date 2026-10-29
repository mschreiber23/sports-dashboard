import { supabase } from '../lib/supabase';
import { idbStorage } from '../lib/idbStorage';
import { emptyRecent, mergeRecent } from '../utils/recentPlayers';

const KEY = 'shribely_viewed_players';

let edits = 0;
const pending = new Map();
const writing = new Set();

function storageKey(userId) {
  return userId ? `${KEY}:${userId}` : KEY;
}

function readLegacy() {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const rows = JSON.parse(raw);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function dropLegacy() {
  try { localStorage.removeItem(KEY); } catch { /* the account copy is the list now */ }
}

function asState(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.players)) return emptyRecent();
  return {
    players: raw.players,
    clearedAt: Number(raw.clearedAt) || 0,
    removed: raw.removed && typeof raw.removed === 'object' ? raw.removed : {},
  };
}

function remoteState(preferences) {
  if (!preferences || typeof preferences !== 'object') return emptyRecent();
  return {
    players: Array.isArray(preferences.recentPlayers) ? preferences.recentPlayers : [],
    clearedAt: Number(preferences.recentClearedAt) || 0,
    removed: preferences.recentRemoved && typeof preferences.recentRemoved === 'object' ? preferences.recentRemoved : {},
  };
}

async function readLocal(userId) {
  const saved = asState(await idbStorage.getItem(storageKey(userId)));
  const legacy = readLegacy();
  if (!legacy.length) return saved;
  return mergeRecent(saved, { players: legacy, clearedAt: 0, removed: {} });
}

async function readRemote(userId) {
  if (!userId) return null;
  const { data, error } = await supabase
    .from('user_preferences')
    .select('preferences, sport_order')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return null;
  return {
    state: remoteState(data?.preferences),
    sportOrder: data?.sport_order || null,
    preferences: data?.preferences && typeof data.preferences === 'object' ? data.preferences : {},
  };
}

async function writeRemote(userId, state) {
  if (!userId) return;
  const { data, error } = await supabase
    .from('user_preferences')
    .select('preferences, sport_order')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return;
  const base = data?.preferences && typeof data.preferences === 'object' ? data.preferences : {};
  const payload = {
    user_id: userId,
    preferences: {
      ...base,
      recentPlayers: state.players || [],
      recentClearedAt: state.clearedAt || 0,
      recentRemoved: state.removed || {},
    },
    updated_at: new Date().toISOString(),
  };
  if (data?.sport_order) payload.sport_order = data.sport_order;
  await supabase.from('user_preferences').upsert(payload, { onConflict: 'user_id' });
}

function sameState(a, b) {
  return JSON.stringify(a?.players || []) === JSON.stringify(b?.players || [])
    && (a?.clearedAt || 0) === (b?.clearedAt || 0)
    && JSON.stringify(a?.removed || {}) === JSON.stringify(b?.removed || {});
}

export async function loadRecent(userId) {
  const seen = edits;
  const local = await readLocal(userId);
  const remote = await readRemote(userId);
  if (edits !== seen) return null;
  const merged = remote ? mergeRecent(local, remote.state) : local;
  await idbStorage.setItem(storageKey(userId), merged);
  if (edits !== seen) return null;
  dropLegacy();
  return { state: merged, dirty: Boolean(remote && !sameState(merged, remote.state)) };
}

async function flush(userId) {
  if (writing.has(userId)) return;
  writing.add(userId);
  try {
    while (pending.has(userId)) {
      const next = pending.get(userId);
      pending.delete(userId);
      await idbStorage.setItem(storageKey(userId), next);
      await writeRemote(userId, next);
    }
  } finally {
    writing.delete(userId);
    if (pending.has(userId)) flush(userId);
  }
}

export function saveRecent(userId, state) {
  const key = userId || '';
  edits += 1;
  pending.set(key, state);
  return flush(key);
}
