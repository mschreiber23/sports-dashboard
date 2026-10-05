import { supabase } from '../lib/supabase';
import { idbStorage } from '../lib/idbStorage';

const KEY = 'prop_trades_v1';
const UNIT_KEY = 'prop_unit_v1';
let remoteOff = false;

function parseLocal(raw) {
  if (!raw) return [];
  try {
    const rows = JSON.parse(raw);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
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
    result: trade.result,
    actual: trade.actual,
    graded_at: trade.gradedAt ? new Date(trade.gradedAt).toISOString() : null,
    recorded_at: new Date(trade.recordedAt || Date.now()).toISOString(),
  };
}

function prefer(local, remote) {
  if (!local) return remote;
  if (!remote) return local;
  const first = (local.recordedAt || 0) <= (remote.recordedAt || 0) ? local : remote;
  const graded = [local, remote]
    .filter((row) => row.result)
    .sort((a, b) => (b.gradedAt || 0) - (a.gradedAt || 0))[0];
  if (!graded) return first;
  return {
    ...first,
    result: graded.result,
    actual: graded.actual,
    gradedAt: graded.gradedAt,
  };
}

async function remoteLoad(userId) {
  if (!userId || remoteOff) return null;
  const all = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await supabase
      .from('prop_trades')
      .select('*')
      .eq('user_id', userId)
      .range(from, from + 999);
    if (error) {
      remoteOff = true;
      return null;
    }
    const page = (data || []).map(fromRemote);
    all.push(...page);
    if (page.length < 1000) break;
  }
  return all;
}

async function remoteSave(userId, rows) {
  if (!userId || remoteOff || !rows.length) return;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200).map((row) => toRemote(userId, row));
    const { error } = await supabase.from('prop_trades').upsert(chunk, { onConflict: 'id' });
    if (error) {
      remoteOff = true;
      return;
    }
  }
}

export async function loadTrades(userId) {
  const local = parseLocal(await idbStorage.getItem(KEY));
  let remote = null;
  try {
    remote = await remoteLoad(userId);
  } catch {
    remote = null;
  }
  if (!remote) return local;
  const map = new Map();
  for (const row of local) map.set(row.id, row);
  for (const row of remote) map.set(row.id, prefer(map.get(row.id), row));
  const merged = [...map.values()];
  await idbStorage.setItem(KEY, JSON.stringify(merged));
  return merged;
}

export async function saveTrades(userId, rows) {
  await idbStorage.setItem(KEY, JSON.stringify(rows));
  try {
    await remoteSave(userId, rows);
  } catch {
    remoteOff = true;
  }
}

export async function loadUnit() {
  const raw = await idbStorage.getItem(UNIT_KEY);
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? n : 25;
}

export async function saveUnit(unit) {
  await idbStorage.setItem(UNIT_KEY, String(unit));
}
