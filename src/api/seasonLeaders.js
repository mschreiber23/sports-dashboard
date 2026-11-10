import axios from 'axios';
import { activeSeasonYear } from './espn.js';
import { mergeSeasonAthletes, nhlHitBlock, rowsFromSeasonAthletes } from '../utils/seasonLeaders.js';

const LEAGUE = {
  nba: 'basketball/nba',
  nhl: 'hockey/nhl',
  nfl: 'football/nfl',
  mlb: 'baseball/mlb',
};

const cache = new Map();

function seasonUrl(sport, year, page, sort) {
  const qualified = sport === 'nfl' || sport === 'mlb' ? '&isqualified=false' : '';
  const order = sort ? `&sort=${encodeURIComponent(sort)}` : '';
  return `https://site.web.api.espn.com/apis/common/v3/sports/${LEAGUE[sport]}/statistics/byathlete?season=${year}&seasontype=2&limit=500&page=${page}${qualified}${order}`;
}

async function athletesForYear(sport, year, sort) {
  const first = await axios.get(seasonUrl(sport, year, 1, sort));
  const pages = first.data?.pagination?.pages || 1;
  const schema = first.data?.categories || [];
  const athletes = [...(first.data?.athletes || [])];
  if (pages > 1) {
    const rest = await Promise.all(
      Array.from({ length: pages - 1 }, (_, index) => axios.get(seasonUrl(sport, year, index + 2, sort)))
    );
    for (const res of rest) athletes.push(...(res.data?.athletes || []));
  }
  return { athletes, schema };
}

async function mapPool(items, size, fn) {
  const out = [];
  for (let index = 0; index < items.length; index += size) {
    const slice = items.slice(index, index + size);
    out.push(...await Promise.all(slice.map(fn)));
  }
  return out;
}

async function nhlExtras(year, athletes) {
  const ids = athletes
    .filter((entry) => {
      const position = String(entry.athlete?.position?.abbreviation || '').toUpperCase();
      return position !== 'G' && position !== 'GK';
    })
    .map((entry) => entry.athlete?.id)
    .filter(Boolean);
  const extras = {};
  await mapPool(ids, 120, async (id) => {
    try {
      const { data } = await axios.get(
        `https://sports.core.api.espn.com/v2/sports/hockey/leagues/nhl/seasons/${year}/types/2/athletes/${id}/statistics`
      );
      extras[String(id)] = nhlHitBlock(data);
    } catch {
      extras[String(id)] = { hits: null, blocks: null };
    }
  });
  return extras;
}

async function loadYear(sport, year) {
  if (sport === 'mlb') {
    const [hitting, pitching] = await Promise.all([
      athletesForYear(sport, year),
      athletesForYear(sport, year, 'pitching.innings:desc'),
    ]);
    const athletes = mergeSeasonAthletes([hitting.athletes, pitching.athletes]);
    return rowsFromSeasonAthletes(sport, athletes, hitting.schema);
  }
  const { athletes, schema } = await athletesForYear(sport, year);
  const extras = sport === 'nhl' ? await nhlExtras(year, athletes) : undefined;
  return rowsFromSeasonAthletes(sport, athletes, schema, extras);
}

export async function loadSeasonLeaders(sport, now = new Date()) {
  const year = activeSeasonYear(sport, now);
  const key = `${sport}:${year}`;
  if (cache.has(key)) return cache.get(key);
  const pending = (async () => {
    try {
      const players = await loadYear(sport, year);
      if (players.length) return { sport, year, players };
    } catch { /* try the previous season */ }
    const players = await loadYear(sport, year - 1);
    return { sport, year: year - 1, players };
  })();
  cache.set(key, pending);
  try {
    return await pending;
  } catch (err) {
    cache.delete(key);
    throw err;
  }
}
