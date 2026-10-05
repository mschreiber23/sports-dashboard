import { supabase } from '../lib/supabase';
import { idbStorage } from '../lib/idbStorage';

const KEY = 'prop_reads_v1';
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
    team: row.team || '',
    opponent: row.opponent || '',
    propType: row.prop_type,
    propLabel: row.prop_label,
    line: Number(row.line),
    price: Number(row.price),
    modelP: Number(row.model_p),
    baseP: row.base_p == null ? null : Number(row.base_p),
    edge: Number(row.edge),
    rate: row.rate,
    hits: row.hits,
    sample: row.sample,
    tags: Array.isArray(row.tags) ? row.tags : [],
    result: row.result || null,
    actual: row.actual == null ? null : Number(row.actual),
    gradedAt: row.graded_at ? new Date(row.graded_at).getTime() : null,
    recordedAt: row.recorded_at ? new Date(row.recorded_at).getTime() : Date.now(),
    pricedAt: row.priced_at ? new Date(row.priced_at).getTime() : null,
  };
}

function remoteId(userId, read) {
  return `${userId}|${read.id}`;
}

function toRemote(userId, read) {
  return {
    id: remoteId(userId, read),
    user_id: userId,
    league: read.league,
    event_slug: read.eventSlug,
    game: read.game,
    game_start: new Date(read.gameStart).toISOString(),
    player: read.player,
    team: read.team || '',
    opponent: read.opponent || '',
    prop_type: read.propType,
    prop_label: read.propLabel,
    line: read.line,
    price: read.price,
    model_p: read.modelP,
    base_p: typeof read.baseP === 'number' ? read.baseP : null,
    edge: read.edge,
    rate: read.rate,
    hits: read.hits,
    sample: read.sample,
    tags: read.tags || [],
    result: read.result,
    actual: read.actual,
    graded_at: read.gradedAt ? new Date(read.gradedAt).toISOString() : null,
    recorded_at: new Date(read.recordedAt || Date.now()).toISOString(),
    priced_at: read.pricedAt ? new Date(read.pricedAt).toISOString() : null,
  };
}

function prefer(local, remote) {
  if (!local) return remote;
  if (!remote) return local;
  const first = (local.recordedAt || 0) <= (remote.recordedAt || 0) ? local : remote;
  const latestPrice = (local.pricedAt || local.recordedAt || 0) >= (remote.pricedAt || remote.recordedAt || 0)
    ? local
    : remote;
  const graded = [local, remote]
    .filter((row) => row.result)
    .sort((a, b) => (b.gradedAt || 0) - (a.gradedAt || 0))[0];
  return {
    ...first,
    price: latestPrice.price,
    baseP: typeof latestPrice.baseP === 'number' ? latestPrice.baseP : first.baseP,
    modelP: latestPrice.modelP,
    edge: latestPrice.edge,
    tags: latestPrice.tags || first.tags,
    pricedAt: latestPrice.pricedAt || latestPrice.recordedAt || null,
    result: graded?.result || null,
    actual: graded ? graded.actual : null,
    gradedAt: graded?.gradedAt || null,
  };
}

async function remoteLoad(userId) {
  if (!userId || remoteOff) return null;
  const all = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await supabase
      .from('prop_reads')
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
    const { error } = await supabase.from('prop_reads').upsert(chunk, { onConflict: 'id' });
    if (error) {
      remoteOff = true;
      return;
    }
  }
}

export async function loadReads(userId) {
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

export async function saveReads(userId, rows) {
  await idbStorage.setItem(KEY, JSON.stringify(rows));
  try {
    await remoteSave(userId, rows);
  } catch {
    remoteOff = true;
  }
}
