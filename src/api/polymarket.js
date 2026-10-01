import { scoreProp } from '../utils/propHit';

const GAMMA = 'https://gamma-api.polymarket.com';
const CACHE_KEY = 'props_markets_v4';
const CACHE_MS = 3 * 60 * 1000;

export const PLAYER_PROP_TYPES = [
  'points', 'rebounds', 'assists', 'assists_points_rebounds', 'threes', 'double_doubles',
  'passing_yards', 'passing_touchdowns', 'passing_attempts', 'passing_completions',
  'rushing_yards', 'receiving_yards', 'receptions',
  'anytime_touchdowns', 'first_touchdowns', 'two_plus_touchdowns',
  'baseball_player_hits', 'baseball_player_home_runs', 'baseball_player_rbis',
  'baseball_player_total_bases', 'baseball_player_strikeouts', 'baseball_player_stolen_bases',
  'baseball_player_hits_runs_rbis',
  'hits', 'home_runs', 'rbis',
  'soccer_player_goals', 'soccer_player_assists', 'soccer_player_shots',
  'soccer_player_shots_on_target', 'soccer_anytime_goalscorer', 'soccer_player_goals_plus_assists',
];

const TYPE_LABEL = {
  points: 'points',
  rebounds: 'rebounds',
  assists: 'assists',
  assists_points_rebounds: 'points + rebounds + assists',
  threes: 'threes',
  double_doubles: 'double-double',
  passing_yards: 'passing yards',
  passing_touchdowns: 'passing TDs',
  passing_attempts: 'pass attempts',
  passing_completions: 'completions',
  rushing_yards: 'rushing yards',
  receiving_yards: 'receiving yards',
  receptions: 'receptions',
  anytime_touchdowns: 'anytime TD',
  first_touchdowns: 'first TD',
  two_plus_touchdowns: '2+ TDs',
  baseball_player_hits: 'hits',
  baseball_player_home_runs: 'home runs',
  baseball_player_rbis: 'RBIs',
  baseball_player_total_bases: 'total bases',
  baseball_player_strikeouts: 'strikeouts',
  baseball_player_stolen_bases: 'stolen bases',
  baseball_player_hits_runs_rbis: 'hits + runs + RBIs',
  hits: 'hits',
  home_runs: 'home runs',
  rbis: 'RBIs',
  soccer_player_goals: 'goals',
  soccer_player_assists: 'assists',
  soccer_player_shots: 'shots',
  soccer_player_shots_on_target: 'shots on target',
  soccer_anytime_goalscorer: 'anytime goal',
  soccer_player_goals_plus_assists: 'goals + assists',
};

const LEAGUE_TO_SPORT = {
  nfl: 'NFL', nba: 'NBA', wnba: 'WNBA', mlb: 'MLB', nhl: 'NHL',
  cfb: 'NCAAF', ncaaf: 'NCAAF', ncaab: 'NCAAB', cbb: 'NCAAB',
  ufc: 'UFC',
  epl: 'Soccer', mls: 'Soccer', ucl: 'Soccer', uel: 'Soccer', nwsl: 'Soccer',
  lal: 'Soccer', bun: 'Soccer', sea: 'Soccer', mex: 'Soccer', ligue1: 'Soccer',
};

export const SPORT_ORDER = ['NFL', 'NBA', 'WNBA', 'MLB', 'NHL', 'NCAAF', 'NCAAB', 'Soccer', 'UFC'];

function parseGameStart(raw) {
  if (!raw) return null;
  const iso = String(raw).trim().replace(' ', 'T').replace(/\+00$/, 'Z');
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

function sportOf(type, slug) {
  if (String(type).startsWith('soccer_')) return 'Soccer';
  const league = String(slug || '').split('-')[0].toLowerCase();
  return LEAGUE_TO_SPORT[league] || (league ? league.toUpperCase() : 'Other');
}

function leagueOf(slug) {
  return String(slug || '').split('-')[0].toLowerCase();
}

async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const idx = next++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  const n = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: n }, worker));
  return out;
}

async function fetchType(type) {
  const rows = [];
  for (let offset = 0; offset < 2000; offset += 100) {
    const url = `${GAMMA}/markets?sports_market_types=${encodeURIComponent(type)}&closed=false&active=true&limit=100&offset=${offset}`;
    const res = await fetch(url);
    if (!res.ok) break;
    const page = await res.json();
    if (!Array.isArray(page) || page.length === 0) break;
    rows.push(...page);
    if (page.length < 100) break;
  }
  return rows;
}

function pricesOf(raw) {
  let parsed = raw;
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw); } catch { return [null, null]; }
  }
  if (!Array.isArray(parsed) || parsed.length < 2) return [null, null];
  const yes = Number(parsed[0]);
  const no = Number(parsed[1]);
  return [Number.isFinite(yes) ? yes : null, Number.isFinite(no) ? no : null];
}

export function normalizeMarket(m) {
  const [yes, no] = pricesOf(m.outcomePrices);
  const gameStart = parseGameStart(m.gameStartTime);
  if (yes == null || no == null || gameStart == null) return null;
  if (m.acceptingOrders === false) return null;
  const question = m.question || '';
  const ou = /O\/U/i.test(question);
  const line = m.line == null || m.line === '' ? null : Number(m.line);
  const scored = scoreProp({
    yes,
    no,
    liquidity: Number(m.liquidityNum ?? m.liquidity) || 0,
    spread: Number(m.spread),
    ou,
  });
  if (!scored) return null;
  const player = question.includes(':') ? question.split(':')[0].trim() : question;
  const event = Array.isArray(m.events) ? m.events[0] : null;
  const type = m.sportsMarketType || '';
  return {
    id: String(m.id),
    player,
    question,
    propLabel: TYPE_LABEL[type] || type.replace(/_/g, ' '),
    type,
    line: Number.isFinite(line) ? line : null,
    ou,
    sport: sportOf(type, m.slug),
    league: leagueOf(m.slug),
    eventTitle: event?.title || '',
    eventSlug: event?.slug || '',
    gameStart,
    yes,
    no,
    liquidity: Number(m.liquidityNum ?? m.liquidity) || 0,
    spread: Number.isFinite(Number(m.spread)) ? Number(m.spread) : null,
    url: event?.slug
      ? `https://polymarket.com/event/${event.slug}`
      : `https://polymarket.com/market/${m.slug}`,
    ...scored,
  };
}

function inWindow(row, now) {
  const from = now - 6 * 60 * 60 * 1000;
  const to = now + 5 * 24 * 60 * 60 * 1000;
  return row.gameStart >= from && row.gameStart <= to;
}

function readCache(now) {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (!saved?.at || now - saved.at > CACHE_MS || !Array.isArray(saved.rows)) return null;
    return saved.rows;
  } catch {
    return null;
  }
}

function writeCache(rows, now) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: now, rows }));
  } catch { /* quota */ }
}

export async function loadPlayerProps(onProgress) {
  const now = Date.now();
  const cached = readCache(now);
  if (cached) {
    onProgress?.({ done: PLAYER_PROP_TYPES.length, total: PLAYER_PROP_TYPES.length });
    return cached.filter((row) => inWindow(row, now));
  }

  let done = 0;
  const batches = await mapPool(PLAYER_PROP_TYPES, 5, async (type) => {
    try {
      return await fetchType(type);
    } catch {
      return [];
    } finally {
      done += 1;
      onProgress?.({ done, total: PLAYER_PROP_TYPES.length });
    }
  });

  const seen = new Set();
  const rows = [];
  for (const markets of batches) {
    for (const market of markets) {
      if (!market?.id || seen.has(market.id)) continue;
      seen.add(market.id);
      const row = normalizeMarket(market);
      if (!row || !inWindow(row, now)) continue;
      rows.push(row);
    }
  }
  const primary = keepPrimaryLines(rows);
  primary.sort(compareProps);
  writeCache(primary, now);
  return primary;
}

/**
 * One over/under per player, prop, and game. Prefer the strongest side that
 * is still under a 90% lock. A 94% alternate is kept only when every line is a lock.
 */
export function keepPrimaryLines(rows) {
  const yesNo = [];
  const groups = new Map();
  for (const row of rows) {
    if (!row.ou) {
      yesNo.push(row);
      continue;
    }
    const key = `${row.eventSlug}|${normKey(row.player)}|${row.type}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const ou = [];
  for (const list of groups.values()) {
    const open = list.filter((row) => !row.lock);
    const pool = (open.length ? open : list).slice().sort(compareProps);
    ou.push(pool[0]);
  }
  return [...yesNo, ...ou];
}

function normKey(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function compareProps(a, b) {
  if (a.lock !== b.lock) return a.lock ? 1 : -1;
  return b.hit - a.hit;
}

export function formatGameTime(ms) {
  if (!ms) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(ms)) + ' ET';
}

export function formatLiquidity(n) {
  if (n >= 10000) return `$${(n / 1000).toFixed(0)}k`;
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  if (n >= 100) return `$${Math.round(n)}`;
  return `$${Math.round(n)}`;
}
