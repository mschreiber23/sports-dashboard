const ABBR = {
  NJ: 'NJD', NJD: 'NJD',
  TB: 'TBL', TBL: 'TBL',
  LA: 'LAK', LAK: 'LAK',
  SJ: 'SJS', SJS: 'SJS',
  WAS: 'WSH', WSH: 'WSH',
  MON: 'MTL', MTL: 'MTL',
  VEG: 'VGK', VGK: 'VGK',
  CAL: 'CGY', CGY: 'CGY',
  UTAH: 'UTA', UTA: 'UTA',
};

const idCache = new Map();
const seasonCache = new Map();

function canon(abbr) {
  const key = String(abbr || '').toUpperCase();
  return ABBR[key] || key;
}

function normName(name) {
  return String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '');
}

function espnSeasons(now = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(new Date(now));
  const year = Number(parts.find((part) => part.type === 'year').value);
  const month = Number(parts.find((part) => part.type === 'month').value);
  const ending = month >= 9 ? year + 1 : year;
  return [ending, ending - 1, ending - 2];
}

function faces(game, abbr, name) {
  if (canon(game.opponent) && canon(game.opponent) === canon(abbr)) return true;
  const want = String(name || '').toLowerCase();
  return Boolean(want) && String(game.opponentName || '').toLowerCase().includes(want);
}

async function espnId(name) {
  const key = normName(name);
  if (!key) return null;
  if (idCache.has(key)) return idCache.get(key);
  const pending = (async () => {
    const res = await fetch(`https://site.web.api.espn.com/apis/search/v2?query=${encodeURIComponent(name)}&limit=5`);
    if (!res.ok) return null;
    const data = await res.json();
    const contents = (data.results || []).find((result) => result.type === 'player')?.contents || [];
    const hit = contents.find((item) => {
      const league = `${item.defaultLeagueSlug || ''} ${item.description || ''}`.toLowerCase();
      return league.includes('nhl') && normName(item.displayName) === key;
    });
    return hit?.uid?.match(/a:(\d+)/)?.[1] || null;
  })().catch(() => null);
  idCache.set(key, pending);
  return pending;
}

function gamesFromLog(data) {
  const names = data?.names || [];
  const goalsIdx = names.indexOf('goals');
  const pointsIdx = names.indexOf('points');
  const games = [];
  const seen = new Set();
  for (const season of data?.seasonTypes || []) {
    for (const category of season.categories || []) {
      for (const event of category.events || []) {
        if (!event?.eventId || seen.has(event.eventId)) continue;
        const meta = data.events?.[event.eventId];
        if (!meta?.gameDate) continue;
        seen.add(event.eventId);
        games.push({
          date: meta.gameDate,
          opponent: meta.opponent?.abbreviation || '',
          opponentName: meta.opponent?.displayName || '',
          goals: Number(event.stats?.[goalsIdx]) || 0,
          points: Number(event.stats?.[pointsIdx]) || 0,
        });
      }
    }
  }
  return games;
}

async function seasonGames(athleteId, year) {
  const key = `${athleteId}|${year}`;
  if (seasonCache.has(key)) return seasonCache.get(key);
  const pending = (async () => {
    const res = await fetch(`https://site.web.api.espn.com/apis/common/v3/sports/hockey/nhl/athletes/${athleteId}/gamelog?season=${year}`);
    if (!res.ok) return [];
    return gamesFromLog(await res.json());
  })().catch(() => []);
  seasonCache.set(key, pending);
  return pending;
}

function series(games, key) {
  return games.map((game) => game[key]);
}

export async function recentNhlLogs(players) {
  const unique = [];
  const seen = new Set();
  for (const player of players) {
    if (!player?.name || seen.has(player.name)) continue;
    seen.add(player.name);
    unique.push(player);
  }
  const out = {};
  let next = 0;
  async function worker() {
    while (next < unique.length) {
      const player = unique[next++];
      const id = await espnId(player.name);
      if (!id) {
        out[player.name] = null;
        continue;
      }
      const years = espnSeasons(player.before || Date.now());
      const chunks = await Promise.all(years.map((year) => seasonGames(id, year)));
      const games = chunks.flat()
        .filter((game) => !player.before || new Date(game.date).getTime() < player.before)
        .sort((a, b) => new Date(b.date) - new Date(a.date));
      const recent = games.slice(0, 10).reverse();
      const versus = games.filter((game) => faces(game, player.opponentAbbr, player.opponentName)).slice(0, 5).reverse();
      out[player.name] = {
        goals: series(recent, 'goals'),
        points: series(recent, 'points'),
        vsGoals: series(versus, 'goals'),
        vsPoints: series(versus, 'points'),
        opponent: player.opponentName || player.opponentAbbr || '',
      };
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, unique.length) }, worker));
  return out;
}
