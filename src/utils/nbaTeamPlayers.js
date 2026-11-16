import { chartMax, mergeGames, nextOpponent } from './nhlTeamSkaters.js';

export { chartMax, mergeGames, nextOpponent };

export const NBA_CATEGORIES = [
  { key: 'points', label: 'PTS', word: 'points' },
  { key: 'rebounds', label: 'REB', word: 'rebounds' },
  { key: 'assists', label: 'AST', word: 'assists' },
  { key: 'blocks', label: 'BLK', word: 'blocks' },
  { key: 'steals', label: 'STL', word: 'steals' },
];

const STAT_NAMES = {
  points: 'points',
  rebounds: 'totalRebounds',
  assists: 'assists',
  blocks: 'blocks',
  steals: 'steals',
};

const ABBR = {
  GS: 'GSW',
  GSW: 'GSW',
  NO: 'NOP',
  NOP: 'NOP',
  NY: 'NYK',
  NYK: 'NYK',
  SA: 'SAS',
  SAS: 'SAS',
  PHO: 'PHX',
  PHX: 'PHX',
  UTAH: 'UTA',
  UTA: 'UTA',
};

function canon(abbr) {
  const key = String(abbr || '').toUpperCase();
  return ABBR[key] || key;
}

function statAt(stats, index) {
  if (index < 0) return 0;
  const value = Number(stats?.[index]);
  return Number.isFinite(value) ? value : 0;
}

export function playersFromRoster(groups) {
  const players = [];
  const seen = new Set();
  for (const group of groups || []) {
    const items = Array.isArray(group?.items) ? group.items : (group?.id ? [group] : []);
    for (const player of items) {
      if (!player?.id || seen.has(String(player.id))) continue;
      seen.add(String(player.id));
      players.push({
        id: String(player.id),
        name: player.shortName || player.displayName || '',
        fullName: player.displayName || '',
        position: String(player.position?.abbreviation || '').toUpperCase(),
        headshot: player.headshot?.href || '',
      });
    }
  }
  return players;
}

export function gamesFromNbaLog(data) {
  const names = data?.names || [];
  const index = {};
  for (const [key, name] of Object.entries(STAT_NAMES)) index[key] = names.indexOf(name);
  const games = [];
  const seen = new Set();
  for (const season of data?.seasonTypes || []) {
    if (!/regular season/i.test(season?.displayName || '')) continue;
    for (const category of season.categories || []) {
      for (const event of category.events || []) {
        if (!event?.eventId || seen.has(event.eventId)) continue;
        const meta = data.events?.[event.eventId];
        if (!meta?.gameDate) continue;
        seen.add(event.eventId);
        const game = {
          id: String(event.eventId),
          date: meta.gameDate,
          opponentId: String(meta.opponent?.id || ''),
          opponentAbbr: meta.opponent?.abbreviation || '',
          opponentName: meta.opponent?.displayName || '',
        };
        for (const key of Object.keys(STAT_NAMES)) game[key] = statAt(event.stats, index[key]);
        games.push(game);
      }
    }
  }
  games.sort((a, b) => new Date(b.date) - new Date(a.date));
  return games;
}

export function seasonAverages(games) {
  const averages = {};
  const played = (games || []).length;
  for (const key of Object.keys(STAT_NAMES)) {
    if (!played) {
      averages[key] = null;
      continue;
    }
    const total = games.reduce((sum, game) => sum + game[key], 0);
    averages[key] = total / played;
  }
  return averages;
}

export function formatAverage(value) {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toFixed(1);
}

export function statSeries(games, key, limit = 10) {
  return (games || []).slice(0, limit).map((game) => game[key] || 0).reverse();
}

export function facesNbaOpponent(game, opponent) {
  if (!game || !opponent) return false;
  if (game.opponentId && opponent.id && String(game.opponentId) === String(opponent.id)) return true;
  const abbr = canon(game.opponentAbbr);
  const want = canon(opponent.abbreviation);
  if (abbr && want && abbr === want) return true;
  const name = String(opponent.name || '').toLowerCase();
  return Boolean(name) && String(game.opponentName || '').toLowerCase().includes(name);
}

export function sortPlayers(rows, key, dir) {
  const sign = dir === 'asc' ? 1 : -1;
  return [...(rows || [])].sort((a, b) => {
    const av = a?.averages?.[key];
    const bv = b?.averages?.[key];
    if (av == null && bv == null) return String(a?.name || '').localeCompare(String(b?.name || ''));
    if (av == null) return 1;
    if (bv == null) return -1;
    if (av !== bv) return (av - bv) * sign;
    return String(a?.name || '').localeCompare(String(b?.name || ''));
  });
}
