import { supabase } from '../lib/supabase';
import { idbStorage } from '../lib/idbStorage';
import { mergeBooks, sameBook } from '../utils/tradeSync';

const KEY = 'prop_trades_v1';
const UNIT_KEY = 'prop_unit_v1';
const SEEN_KEY = 'prop_trades_seen_v1';
const DEFAULT_SPORT_ORDER = ['mlb', 'nba', 'nfl', 'nhl'];

// The dedicated table is optional. Until it exists, the book rides along in
// user_preferences, which is the row the account already syncs.
let tableMissing = false;
let chain = Promise.resolve();

function locked(fn) {
  const run = chain.then(fn, fn);
  chain = run.then(() => {}, () => {});
  return run;
}

function parseLocal(raw) {
  if (!raw) return [];
  try {
    const rows = JSON.parse(raw);
    return Array.isArray(rows) ? rows.filter((row) => row?.id) : [];
  } catch {
    return [];
  }
}

function parseSeen(raw) {
  try {
    const ids = JSON.parse(raw);
    return new Set(Array.isArray(ids) ? ids : []);
  } catch {
    return new Set();
  }
}

function localId(userId, remoteId) {
  const prefix = `${userId}|`;
  const id = String(remoteId || '');
  return id.startsWith(prefix) ? id.slice(prefix.length) : id;
}

function fromRemote(row) {
  return {
    id: localId(row.user_id, row.id),
    league: row.league,
    eventSlug: row.event_slug,
    game: row.game,
    gameStart: new Date(row.game_start).getTime(),
    player: row.player,
    propType: row.prop_type,
    propLabel: row.prop_label,
    line: row.line == null ? null : Number(row.line),
    side: row.side || 'yes',
    price: Number(row.price),
    unit: Number(row.unit),
    kind: row.kind || 'player',
    pick: row.pick || '',
    pickAbbr: row.pick_abbr || '',
    teams: Array.isArray(row.teams) ? row.teams : [],
    prediction: row.prediction === 'no' ? 'no' : 'yes',
    edge: row.edge == null ? null : Number(row.edge),
    payout: row.payout == null ? null : Number(row.payout),
    editedAt: row.edited_at ? new Date(row.edited_at).getTime() : null,
    result: row.result || null,
    actual: row.actual == null ? null : Number(row.actual),
    gradedAt: row.graded_at ? new Date(row.graded_at).getTime() : null,
    recordedAt: row.recorded_at ? new Date(row.recorded_at).getTime() : Date.now(),
  };
}

function toRemote(userId, trade) {
  return {
    id: `${userId}|${trade.id}`,
    user_id: userId,
    league: trade.league,
    event_slug: trade.eventSlug,
    game: trade.game,
    game_start: new Date(trade.gameStart).toISOString(),
    player: trade.player,
    prop_type: trade.propType,
    prop_label: trade.propLabel,
    line: trade.line,
    side: trade.side || 'yes',
    price: trade.price,
    unit: trade.unit,
    kind: trade.kind || 'player',
    pick: trade.pick || '',
    pick_abbr: trade.pickAbbr || '',
    teams: trade.teams || [],
    prediction: trade.prediction === 'no' ? 'no' : 'yes',
    edge: trade.edge == null ? null : trade.edge,
    payout: trade.payout == null ? null : trade.payout,
    edited_at: trade.editedAt ? new Date(trade.editedAt).toISOString() : null,
    result: trade.result,
    actual: trade.actual,
    graded_at: trade.gradedAt ? new Date(trade.gradedAt).toISOString() : null,
    recorded_at: new Date(trade.recordedAt || Date.now()).toISOString(),
  };
}

function storageKey(userId) {
  return userId ? `${KEY}:${userId}` : KEY;
}

function seenKey(userId) {
  return `${SEEN_KEY}:${userId || ''}`;
}

function missingTable(error) {
  return error?.code === 'PGRST205' || /prop_trades/.test(error?.message || '');
}

async function readLocal(userId) {
  const scoped = parseLocal(await idbStorage.getItem(storageKey(userId)));
  if (scoped.length || !userId) return scoped;
  const legacy = parseLocal(await idbStorage.getItem(KEY));
  if (!legacy.length) return [];
  await idbStorage.setItem(storageKey(userId), JSON.stringify(legacy));
  await idbStorage.removeItem(KEY);
  return legacy;
}

async function writeLocal(userId, rows) {
  await idbStorage.setItem(storageKey(userId), JSON.stringify(rows));
}

async function readSeen(userId) {
  return parseSeen(await idbStorage.getItem(seenKey(userId)));
}

async function writeSeen(userId, rows) {
  await idbStorage.setItem(seenKey(userId), JSON.stringify(rows.map((row) => row.id)));
}

async function loadTable(userId) {
  if (tableMissing) return 'missing';
  const all = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await supabase
      .from('prop_trades')
      .select('*')
      .eq('user_id', userId)
      .range(from, from + 999);
    if (error) {
      if (missingTable(error)) {
        tableMissing = true;
        return 'missing';
      }
      return null;
    }
    const page = (data || []).map(fromRemote).filter((row) => row.id);
    all.push(...page);
    if (page.length < 1000) break;
  }
  return all;
}

async function loadPrefs(userId) {
  const { data, error } = await supabase
    .from('user_preferences')
    .select('preferences')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return null;
  const trades = data?.preferences?.trades;
  return Array.isArray(trades) ? trades.filter((row) => row?.id) : [];
}

async function remoteLoad(userId) {
  const table = await loadTable(userId);
  if (table === null) return null;
  if (table === 'missing') {
    const rows = await loadPrefs(userId);
    if (!rows) return null;
    return { rows, mode: 'prefs' };
  }
  if (table.length === 0) {
    const prefs = await loadPrefs(userId);
    if (prefs?.length) return { rows: prefs, mode: 'table', migrate: true };
  }
  return { rows: table, mode: 'table' };
}

async function saveTable(userId, rows, previous) {
  const keep = new Set(rows.map((row) => row.id));
  const gone = (previous || [])
    .filter((row) => row?.id && !keep.has(row.id))
    .map((row) => `${userId}|${row.id}`);
  if (gone.length) {
    const { error } = await supabase.from('prop_trades').delete().in('id', gone);
    if (error) {
      if (missingTable(error)) {
        tableMissing = true;
        return savePrefs(userId, rows);
      }
      return false;
    }
  }
  if (!rows.length) return true;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200).map((row) => toRemote(userId, row));
    const { error } = await supabase.from('prop_trades').upsert(chunk, { onConflict: 'id' });
    if (error) {
      if (missingTable(error)) {
        tableMissing = true;
        return savePrefs(userId, rows);
      }
      return false;
    }
  }
  return true;
}

async function clearPrefsTrades(userId) {
  const { data, error } = await supabase
    .from('user_preferences')
    .select('preferences, sport_order')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data?.preferences || !('trades' in data.preferences)) return;
  const preferences = { ...data.preferences };
  delete preferences.trades;
  await supabase.from('user_preferences').upsert({
    user_id: userId,
    preferences,
    sport_order: data.sport_order || DEFAULT_SPORT_ORDER,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
}

async function savePrefs(userId, rows) {
  const { data, error } = await supabase
    .from('user_preferences')
    .select('preferences, sport_order')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return false;
  const base = data?.preferences && typeof data.preferences === 'object' ? data.preferences : {};
  const payload = {
    user_id: userId,
    preferences: { ...base, trades: rows },
    updated_at: new Date().toISOString(),
  };
  if (data?.sport_order) payload.sport_order = data.sport_order;
  const { error: saveError } = await supabase
    .from('user_preferences')
    .upsert(payload, { onConflict: 'user_id' });
  return !saveError;
}

async function remoteSave(userId, rows, source) {
  if (source?.mode === 'table' && !tableMissing) {
    const saved = await saveTable(userId, rows, source.migrate ? [] : source.rows);
    if (saved && source.migrate) await clearPrefsTrades(userId);
    if (saved || !tableMissing) return saved;
  }
  return savePrefs(userId, rows);
}

async function publish(userId, local) {
  const remote = await remoteLoad(userId);
  if (!remote) return local;
  const seen = await readSeen(userId);
  const merged = mergeBooks(local, remote.rows, seen);
  await writeLocal(userId, merged);
  if (!sameBook(merged, remote.rows)) {
    const saved = await remoteSave(userId, merged, remote);
    if (!saved) return merged;
  }
  await writeSeen(userId, merged);
  return merged;
}

export async function loadTrades(userId) {
  return locked(async () => {
    const local = await readLocal(userId);
    if (!userId) return local;
    try {
      return await publish(userId, local);
    } catch {
      return local;
    }
  });
}

export async function saveTrades(userId, rows) {
  return locked(async () => {
    await writeLocal(userId, rows);
    if (!userId) return rows;
    try {
      return await publish(userId, rows);
    } catch {
      return rows;
    }
  });
}

export async function loadUnit() {
  const raw = await idbStorage.getItem(UNIT_KEY);
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? n : 25;
}

export async function saveUnit(unit) {
  await idbStorage.setItem(UNIT_KEY, String(unit));
}
