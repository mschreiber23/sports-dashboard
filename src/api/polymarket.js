import { scoreProp } from '../utils/propHit';

const GAMMA = 'https://gamma-api.polymarket.com';
const US_GATEWAY = 'https://web.polymarket.us';
const CACHE_KEY = 'props_markets_v7';
const NHL_SERIES = '10346';
const NHL_PROP_TYPES = new Set([
  'hockey_player_points',
  'hockey_player_goals',
  'hockey_team_saves',
]);
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
  moneyline: 'moneyline',
  spreads: 'spread',
  totals: 'total',
  hockey_player_points: 'points',
  hockey_player_goals: 'goals',
  hockey_team_saves: 'saves',
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

function parseList(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }
  return [];
}

function pricesOf(raw) {
  const parsed = parseList(raw);
  if (parsed.length < 2) return [null, null];
  const yes = Number(parsed[0]);
  const no = Number(parsed[1]);
  return [Number.isFinite(yes) ? yes : null, Number.isFinite(no) ? no : null];
}

function cleanTitle(title) {
  return String(title || '').replace(/\s*[-–]\s*Player Props\s*$/i, '').trim();
}

function spreadText(question, name, line) {
  const match = String(question).match(/Spread:\s*(.+?)\s*\(([+-]?\d+(?:\.\d+)?)\)/i);
  if (!match) return name;
  const listed = match[1].trim();
  const listedLine = Number(match[2]);
  const fmt = (n) => (n > 0 ? `+${n}` : String(n));
  if (name === listed) return `${listed} ${fmt(listedLine)}`;
  if (Number.isFinite(line)) return `${name} ${fmt(-listedLine)}`;
  return name;
}

export function normalizeMarket(m) {
  const [priceA, priceB] = pricesOf(m.outcomePrices);
  const gameStart = parseGameStart(m.gameStartTime);
  if (priceA == null || priceB == null || gameStart == null) return null;
  if (m.acceptingOrders === false) return null;
  const question = m.question || '';
  const names = parseList(m.outcomes).map((name) => String(name));
  const overUnder = names.length >= 2 && names.every((name) => /^(over|under)$/i.test(name));
  const ou = overUnder || /O\/U/i.test(question);
  let yes = priceA;
  let no = priceB;
  if (overUnder && /^under$/i.test(names[0])) {
    yes = priceB;
    no = priceA;
  }
  const line = m.line == null || m.line === '' ? null : Number(m.line);
  const liquidity = Number(m.liquidityNum ?? m.liquidity) || 0;
  const spread = Number(m.spread);
  const type = m.sportsMarketType || '';
  const named = !ou && names.length >= 2;
  const favored = named
    ? [...names.map((name, i) => ({ name, price: i === 0 ? priceA : priceB }))]
      .sort((a, b) => b.price - a.price)[0]
    : null;
  const scored = scoreProp({
    yes: favored ? favored.price : yes,
    no: favored ? (favored.price === priceA ? priceB : priceA) : no,
    liquidity,
    spread,
    ou: ou || named,
  });
  if (!scored) return null;
  const player = question.includes(':') ? question.split(':')[0].trim() : question;
  let sideText = ou && Number.isFinite(line)
    ? `${scored.side} ${line} ${TYPE_LABEL[type] || type.replace(/_/g, ' ')}`
    : (question.includes(':') ? question.split(':').slice(1).join(':').trim() : (TYPE_LABEL[type] || player));
  let headline = player;
  if (ou && type === 'totals' && Number.isFinite(line)) {
    headline = `${scored.side} ${line}`;
    sideText = 'total';
  }
  if (named && favored) {
    headline = type === 'spreads' ? spreadText(question, favored.name, line) : favored.name;
    sideText = TYPE_LABEL[type] || type.replace(/_/g, ' ');
    scored.side = favored.name;
  }
  const event = Array.isArray(m.events) ? m.events[0] : null;
  const eventSlug = event?.slug || '';
  return {
    id: String(m.id),
    player: headline,
    sideText,
    question,
    propLabel: TYPE_LABEL[type] || type.replace(/_/g, ' '),
    type,
    line: Number.isFinite(line) ? line : null,
    ou,
    sport: sportOf(type, m.slug || eventSlug),
    league: leagueOf(m.slug || eventSlug),
    eventTitle: cleanTitle(event?.title || ''),
    eventSlug,
    gameStart,
    yes,
    no,
    liquidity,
    spread: Number.isFinite(spread) ? spread : null,
    url: eventSlug
      ? `https://polymarket.us/event/${eventSlug}`
      : `https://polymarket.us/event/${m.slug}`,
    ...scored,
    side: named && favored ? favored.name : scored.side,
  };
}

export function easternDay(ms) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms));
}

export function shiftDay(ymd, days) {
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days, 16, 0, 0));
  return easternDay(date.getTime());
}

export function formatDayLabel(ymd, now = Date.now()) {
  if (ymd === easternDay(now)) return 'Today';
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 16, 0, 0));
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function inWindow(row, now) {
  const day = easternDay(row.gameStart);
  return day >= easternDay(now) && day <= easternDay(now + 5 * 24 * 60 * 60 * 1000);
}

async function fetchNhlGameMarkets() {
  const markets = [];
  for (let offset = 0; offset < 400; offset += 50) {
    const url = `${GAMMA}/events?series_id=${NHL_SERIES}&closed=false&active=true&limit=50&offset=${offset}`;
    const res = await fetch(url);
    if (!res.ok) break;
    const events = await res.json();
    if (!Array.isArray(events) || events.length === 0) break;
    for (const event of events) {
      if (!/^nhl-[a-z0-9]+-[a-z0-9]+-\d{4}-\d{2}-\d{2}$/.test(event.slug || '')) continue;
      for (const market of event.markets || []) {
        markets.push({
          ...market,
          events: [{ title: event.title, slug: event.slug }],
          gameStartTime: market.gameStartTime || event.startTime,
        });
      }
    }
    if (events.length < 50) break;
  }
  return markets;
}

function yesQuote(market) {
  const bid = Number(market.bestBidQuote?.value);
  const ask = Number(market.bestAskQuote?.value);
  const hasBid = Number.isFinite(bid) && bid >= 0 && bid <= 1;
  const hasAsk = Number.isFinite(ask) && ask >= 0 && ask <= 1;
  if (hasBid && hasAsk && ask >= bid) {
    const yes = (bid + ask) / 2;
    if (!(yes > 0) || yes > 1) return null;
    return { yes, no: 1 - yes, spread: ask - bid };
  }
  const yes = hasAsk && ask > 0 ? ask : (hasBid && bid > 0 ? bid : null);
  if (yes == null || yes > 1) return null;
  return { yes, no: 1 - yes, spread: null };
}

function normalizeNhlProp(market, event) {
  if (!NHL_PROP_TYPES.has(market.sportsMarketType)) return null;
  if (market.hidden || market.closed || market.active === false) return null;
  if (market.status && market.status !== 'MARKET_STATUS_OPEN') return null;
  const quote = yesQuote(market);
  const gameStart = parseGameStart(market.gameStartTime || event.startTime);
  if (!quote || gameStart == null) return null;
  const label = TYPE_LABEL[market.sportsMarketType] || 'prop';
  const line = market.line == null || market.line === '' ? null : Number(market.line);
  const playerName = market.metadata?.playerName || '';
  const lineText = Number.isFinite(line) ? `${line}+ ${label}` : label;
  const teamTitle = String(market.title || '').replace(/\s+\d+\+\s+\S.*$/, '').trim();
  const scored = scoreProp({
    yes: quote.yes,
    no: quote.no,
    liquidity: null,
    spread: quote.spread,
    ou: false,
  });
  if (!scored) return null;
  return {
    id: `us:${market.id}`,
    player: playerName || teamTitle || market.title || market.question,
    sideText: lineText,
    question: market.question || '',
    propLabel: label,
    type: market.sportsMarketType,
    line: Number.isFinite(line) ? line : null,
    ou: false,
    sport: 'NHL',
    league: 'nhl',
    eventTitle: event.title || '',
    eventSlug: event.slug,
    gameStart,
    yes: quote.yes,
    no: quote.no,
    liquidity: null,
    spread: quote.spread,
    url: `https://polymarket.us/sports/nhl/${event.slug}`,
    ...scored,
    side: 'Yes',
  };
}

async function fetchNhlEventProps(slug) {
  const res = await fetch(`${US_GATEWAY}/gateway.events.v1.EventsService/GetEventBySlug`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'connect-protocol-version': '1',
      'poly-platform': 'web',
    },
    body: JSON.stringify({ slug }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  const event = data.event;
  if (!event?.markets) return [];
  return event.markets.map((market) => normalizeNhlProp(market, event)).filter(Boolean);
}

const nhlPropPromises = new Map();

export function loadNhlPropsForSlugs(slugs) {
  const todo = [...new Set(slugs.filter(Boolean))];
  return mapPool(todo, 4, (slug) => {
    if (!nhlPropPromises.has(slug)) {
      nhlPropPromises.set(slug, fetchNhlEventProps(slug).catch(() => {
        nhlPropPromises.delete(slug);
        return [];
      }));
    }
    return nhlPropPromises.get(slug);
  }).then((lists) => lists.flat());
}

export function mergePropRows(rows, extra) {
  if (!extra?.length) return rows;
  const ids = new Set(rows.map((row) => row.id));
  const add = extra.filter((row) => !ids.has(row.id));
  if (!add.length) return rows;
  return [...rows, ...add].sort(compareProps);
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
    onProgress?.({ done: PLAYER_PROP_TYPES.length + 1, total: PLAYER_PROP_TYPES.length + 1 });
    return cached.filter((row) => inWindow(row, now));
  }

  const total = PLAYER_PROP_TYPES.length + 1;
  let done = 0;
  const tick = () => {
    done += 1;
    onProgress?.({ done, total });
  };
  const [batches, nhlMarkets] = await Promise.all([
    mapPool(PLAYER_PROP_TYPES, 5, async (type) => {
      try {
        return await fetchType(type);
      } catch {
        return [];
      } finally {
        tick();
      }
    }),
    fetchNhlGameMarkets().catch(() => []).finally(tick),
  ]);

  const seen = new Set();
  const rows = [];
  for (const markets of [...batches, nhlMarkets]) {
    for (const market of markets) {
      if (!market?.id || seen.has(market.id)) continue;
      seen.add(market.id);
      const row = normalizeMarket(market);
      if (!row || !inWindow(row, now)) continue;
      rows.push(row);
    }
  }
  rows.sort(compareProps);
  writeCache(rows, now);
  return rows;
}

export function compareProps(a, b) {
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
