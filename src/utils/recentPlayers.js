// Recently viewed players belong to the account, not the phone or the browser.
// Two devices merge by when the player was opened. A clear or a remove on one
// device stays removed on the other.

export const MAX_RECENT_PLAYERS = 20;
const MAX_REMOVED = 50;

export function emptyRecent() {
  return { players: [], clearedAt: 0, removed: {} };
}

export function playerKey(player) {
  return `${player?.sport || ''}|${player?.id || ''}`;
}

function text(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'object') return text(value.abbreviation || value.displayName || value.name || '');
  return '';
}

export function normalizePlayer(player, viewedAt = 0) {
  if (!player?.id || !player?.sport) return null;
  const jersey = text(player.jersey);
  return {
    id: String(player.id),
    sport: String(player.sport),
    name: text(player.name),
    team: text(player.team),
    headshot: text(player.headshot),
    position: text(player.position),
    jersey,
    viewedAt: Number(viewedAt) || Number(player.viewedAt) || 0,
  };
}

function keepRemoved(removed) {
  return Object.entries(removed || {})
    .filter(([, when]) => Number(when) > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_REMOVED)
    .reduce((map, [key, when]) => {
      map[key] = when;
      return map;
    }, {});
}

function fill(newer, older) {
  return {
    ...older,
    ...newer,
    name: newer.name || older.name || '',
    team: newer.team || older.team || '',
    headshot: newer.headshot || older.headshot || '',
    position: newer.position || older.position || '',
    jersey: newer.jersey || older.jersey || '',
    viewedAt: Math.max(newer.viewedAt || 0, older.viewedAt || 0),
  };
}

function visiblePlayers(players, clearedAt, removed) {
  const map = new Map();
  for (const row of players || []) {
    const player = normalizePlayer(row, row?.viewedAt);
    if (!player) continue;
    const key = playerKey(player);
    const prev = map.get(key);
    map.set(key, prev ? fill(player.viewedAt >= prev.viewedAt ? player : prev, player.viewedAt >= prev.viewedAt ? prev : player) : player);
  }
  return [...map.values()]
    .filter((player) => {
      const key = playerKey(player);
      if ((player.viewedAt || 0) <= (clearedAt || 0)) return false;
      if ((player.viewedAt || 0) <= (removed?.[key] || 0)) return false;
      return true;
    })
    .sort((a, b) => (b.viewedAt || 0) - (a.viewedAt || 0) || a.name.localeCompare(b.name))
    .slice(0, MAX_RECENT_PLAYERS);
}

export function mergeRecent(local, remote) {
  const clearedAt = Math.max(local?.clearedAt || 0, remote?.clearedAt || 0);
  const removed = { ...(local?.removed || {}), ...(remote?.removed || {}) };
  for (const key of new Set([...Object.keys(local?.removed || {}), ...Object.keys(remote?.removed || {})])) {
    removed[key] = Math.max(local?.removed?.[key] || 0, remote?.removed?.[key] || 0);
  }
  return {
    players: visiblePlayers([...(remote?.players || []), ...(local?.players || [])], clearedAt, removed),
    clearedAt,
    removed: keepRemoved(removed),
  };
}

export function viewPlayer(state, player, now = Date.now()) {
  const row = normalizePlayer(player, now);
  if (!row) return state || emptyRecent();
  const base = state || emptyRecent();
  const key = playerKey(row);
  const removed = { ...(base.removed || {}) };
  delete removed[key];
  const previous = (base.players || []).find((item) => playerKey(item) === key);
  const next = previous ? fill(row, normalizePlayer(previous, previous.viewedAt)) : row;
  next.viewedAt = now;
  return {
    players: visiblePlayers([next, ...(base.players || [])], base.clearedAt || 0, removed),
    clearedAt: base.clearedAt || 0,
    removed: keepRemoved(removed),
  };
}

export function removeRecentPlayer(state, id, sport, now = Date.now()) {
  const base = state || emptyRecent();
  const key = `${sport}|${id}`;
  return {
    players: (base.players || []).filter((player) => playerKey(player) !== key),
    clearedAt: base.clearedAt || 0,
    removed: keepRemoved({ ...(base.removed || {}), [key]: now }),
  };
}

export function clearRecent(state, now = Date.now()) {
  return { players: [], clearedAt: now, removed: keepRemoved(state?.removed) };
}
