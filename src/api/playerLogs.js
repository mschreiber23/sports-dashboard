const LEAGUES = {
  nhl: { path: 'hockey/nhl', search: ['nhl'] },
  nba: { path: 'basketball/nba', search: ['nba'] },
  wnba: { path: 'basketball/wnba', search: ['wnba'] },
  mlb: { path: 'baseball/mlb', search: ['mlb'] },
  nfl: { path: 'football/nfl', search: ['nfl'] },
  cbb: { path: 'basketball/mens-college-basketball', search: ['mens-college-basketball', 'ncaam'] },
  cfb: { path: 'football/college-football', search: ['college-football', 'ncaaf'] },
};

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
  JAC: 'JAX', JAX: 'JAX',
  GS: 'GSW', GSW: 'GSW',
  NO: 'NOP', NOP: 'NOP',
  NY: 'NYK', NYK: 'NYK',
  SA: 'SAS', SAS: 'SAS',
  PHO: 'PHX', PHX: 'PHX',
  CWS: 'CHW', CHW: 'CHW',
  AZ: 'ARI', ARI: 'ARI',
};

const CHART_LABEL = {
  hockey_player_goals: 'goals',
  hockey_player_points: 'points',
  basketball_player_points: 'points',
  basketball_player_rebounds: 'rebounds',
  basketball_player_assists: 'assists',
  basketball_player_threes: 'threes',
  football_player_passing_yards: 'pass yds',
  football_player_rushing_yards: 'rush yds',
  football_player_receiving_yards: 'rec yds',
  football_player_receptions: 'receptions',
  football_player_touchdowns: 'touchdowns',
  football_player_passing_touchdowns: 'pass TDs',
  football_player_passing_completions: 'completions',
  football_player_passing_attempts: 'pass att',
  football_player_rushing_attempts: 'carries',
  football_player_interceptions_thrown: 'INTs',
  football_player_scrimmage_yards: 'scrim yds',
  football_player_longest_reception: 'long rec',
  baseball_player_hits: 'hits',
  baseball_player_home_runs: 'home runs',
  baseball_player_rbis: 'RBIs',
  baseball_player_total_bases: 'total bases',
  baseball_player_hits_runs_rbis: 'H+R+RBI',
  baseball_player_strikeouts: 'strikeouts',
  baseball_player_stolen_bases: 'steals',
  baseball_player_outs: 'outs',
  baseball_player_hits_allowed: 'hits allowed',
  baseball_player_earned_runs_allowed: 'earned runs',
  baseball_player_walks_allowed: 'walks',
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

function field(stats, name) {
  if (!stats || !Object.prototype.hasOwnProperty.call(stats, name)) return null;
  const value = stats[name];
  return typeof value === 'number' ? value : null;
}

function sumFields(stats, names) {
  let total = 0;
  let any = false;
  for (const name of names) {
    const value = field(stats, name);
    if (value == null) continue;
    any = true;
    total += value;
  }
  return any ? total : null;
}

function made(stats, name) {
  if (!stats || !Object.prototype.hasOwnProperty.call(stats, name)) return null;
  const raw = stats[name];
  if (typeof raw === 'number') return raw;
  const match = String(raw).match(/^(\d+)/);
  return match ? Number(match[1]) : null;
}

function outsRecorded(stats) {
  if (!stats || stats.innings == null) return null;
  const match = String(stats.innings).match(/^(\d+)(?:\.(\d))?/);
  if (!match) return null;
  return Number(match[1]) * 3 + Number(match[2] || 0);
}

function totalBases(stats) {
  const hits = field(stats, 'hits');
  if (hits == null) return null;
  return hits + (field(stats, 'doubles') || 0) + 2 * (field(stats, 'triples') || 0) + 3 * (field(stats, 'homeRuns') || 0);
}

const EXTRACT = {
  hockey_player_goals: (stats) => field(stats, 'goals'),
  hockey_player_points: (stats) => field(stats, 'points'),
  basketball_player_points: (stats) => field(stats, 'points'),
  basketball_player_rebounds: (stats) => field(stats, 'totalRebounds'),
  basketball_player_assists: (stats) => field(stats, 'assists'),
  basketball_player_threes: (stats) => made(stats, 'threePointFieldGoalsMade-threePointFieldGoalsAttempted'),
  football_player_passing_yards: (stats) => field(stats, 'passingYards'),
  football_player_rushing_yards: (stats) => field(stats, 'rushingYards'),
  football_player_receiving_yards: (stats) => field(stats, 'receivingYards'),
  football_player_receptions: (stats) => field(stats, 'receptions'),
  football_player_touchdowns: (stats) => sumFields(stats, ['rushingTouchdowns', 'receivingTouchdowns']),
  football_player_passing_touchdowns: (stats) => field(stats, 'passingTouchdowns'),
  football_player_passing_completions: (stats) => field(stats, 'completions'),
  football_player_passing_attempts: (stats) => field(stats, 'passingAttempts'),
  football_player_rushing_attempts: (stats) => field(stats, 'rushingAttempts'),
  football_player_interceptions_thrown: (stats) => field(stats, 'interceptions'),
  football_player_scrimmage_yards: (stats) => sumFields(stats, ['rushingYards', 'receivingYards']),
  football_player_longest_reception: (stats) => field(stats, 'longReception'),
  baseball_player_hits: (stats) => field(stats, 'hits'),
  baseball_player_home_runs: (stats) => field(stats, 'homeRuns'),
  baseball_player_rbis: (stats) => field(stats, 'RBIs'),
  baseball_player_total_bases: totalBases,
  baseball_player_hits_runs_rbis: (stats) => sumFields(stats, ['hits', 'runs', 'RBIs']),
  baseball_player_strikeouts: (stats) => field(stats, 'strikeouts'),
  baseball_player_stolen_bases: (stats) => field(stats, 'stolenBases'),
  baseball_player_outs: outsRecorded,
  baseball_player_hits_allowed: (stats) => field(stats, 'hits'),
  baseball_player_earned_runs_allowed: (stats) => field(stats, 'earnedRuns'),
  baseball_player_walks_allowed: (stats) => field(stats, 'walks'),
};

export function chartLabel(type) {
  return CHART_LABEL[type] || 'stat';
}

function parseCell(name, raw) {
  if (raw == null || raw === '' || raw === '-' || raw === '--') return undefined;
  if (name === 'innings') return String(raw);
  if (name === 'timeOnIcePerGame') {
    const match = String(raw).match(/^(\d+):(\d{2})$/);
    if (!match) return undefined;
    return Number(match[1]) + Number(match[2]) / 60;
  }
  if (typeof raw === 'string' && /^\d+\s*-\s*\d+/.test(raw)) return raw;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function contextOf(games) {
  const rows = [];
  let any = false;
  for (const game of games) {
    const row = {
      shots: field(game.stats, 'shotsTotal'),
      toi: field(game.stats, 'timeOnIcePerGame'),
      pp: sumFields(game.stats, ['powerPlayGoals', 'powerPlayAssists']),
      goals: field(game.stats, 'goals'),
      assists: field(game.stats, 'assists'),
      passAtt: field(game.stats, 'passingAttempts'),
      passYds: field(game.stats, 'passingYards'),
      passTd: field(game.stats, 'passingTouchdowns'),
      completions: field(game.stats, 'completions'),
      ints: field(game.stats, 'interceptions'),
      rushAtt: field(game.stats, 'rushingAttempts'),
      rushYds: field(game.stats, 'rushingYards'),
      rushTd: field(game.stats, 'rushingTouchdowns'),
      targets: field(game.stats, 'receivingTargets'),
      rec: field(game.stats, 'receptions'),
      recYds: field(game.stats, 'receivingYards'),
      recTd: field(game.stats, 'receivingTouchdowns'),
    };
    if (Object.values(row).some((value) => value != null)) any = true;
    rows.push(row);
  }
  return any ? rows : null;
}

async function espnId(league, name) {
  const sport = LEAGUES[league];
  const key = `${league}|${normName(name)}`;
  if (!sport || !normName(name)) return null;
  if (idCache.has(key)) return idCache.get(key);
  const pending = (async () => {
    const res = await fetch(`https://site.web.api.espn.com/apis/search/v2?query=${encodeURIComponent(name)}&limit=8`);
    if (!res.ok) return null;
    const data = await res.json();
    const contents = (data.results || []).find((result) => result.type === 'player')?.contents || [];
    const want = normName(name);
    const hit = contents.find((item) => {
      const slug = String(item.defaultLeagueSlug || '').toLowerCase();
      const desc = String(item.description || '').toLowerCase();
      return (sport.search.includes(slug) || sport.search.includes(desc)) && normName(item.displayName) === want;
    });
    return hit?.uid?.match(/a:(\d+)/)?.[1] || null;
  })().catch(() => null);
  idCache.set(key, pending);
  return pending;
}

function gamesFromLog(data) {
  const names = data?.names || [];
  const games = [];
  const seen = new Set();
  for (const season of data?.seasonTypes || []) {
    for (const category of season.categories || []) {
      for (const event of category.events || []) {
        if (!event?.eventId || seen.has(event.eventId)) continue;
        const meta = data.events?.[event.eventId];
        if (!meta?.gameDate) continue;
        seen.add(event.eventId);
        const stats = {};
        names.forEach((name, index) => {
          const value = parseCell(name, event.stats?.[index]);
          if (value !== undefined) stats[name] = value;
        });
        games.push({
          date: meta.gameDate,
          opponent: meta.opponent?.abbreviation || '',
          opponentName: meta.opponent?.displayName || '',
          stats,
        });
      }
    }
  }
  return games;
}

async function seasonGames(league, athleteId, year) {
  const sport = LEAGUES[league];
  if (!sport) return [];
  const key = `${league}|${athleteId}|${year}`;
  if (seasonCache.has(key)) return seasonCache.get(key);
  const pending = (async () => {
    const res = await fetch(`https://site.web.api.espn.com/apis/common/v3/sports/${sport.path}/athletes/${athleteId}/gamelog?season=${year}`);
    if (!res.ok) return [];
    return gamesFromLog(await res.json());
  })().catch(() => []);
  seasonCache.set(key, pending);
  return pending;
}

function take(games, type) {
  const extract = EXTRACT[type];
  if (!extract) return null;
  const values = [];
  for (const game of games) {
    const value = extract(game.stats);
    if (value == null) continue;
    values.push(value);
  }
  return values.length ? values : null;
}

export async function recentPlayerLogs(league, players) {
  if (!LEAGUES[league]) return {};
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
      const id = await espnId(league, player.name);
      if (!id) {
        out[player.name] = null;
        continue;
      }
      const years = espnSeasons(player.before || Date.now());
      const chunks = await Promise.all(years.map((year) => seasonGames(league, id, year)));
      const games = chunks.flat()
        .filter((game) => !player.before || new Date(game.date).getTime() < player.before)
        .sort((a, b) => new Date(b.date) - new Date(a.date));
      const recent = games.slice(0, 10).reverse();
      const earlier = games.slice(10, 40);
      const versus = games.filter((game) => faces(game, player.opponentAbbr, player.opponentName)).slice(0, 5).reverse();
      const series = {};
      const prior = {};
      const against = {};
      for (const type of Object.keys(EXTRACT)) {
        const recentValues = take(recent, type);
        if (!recentValues) continue;
        series[type] = recentValues;
        against[type] = take(versus, type) || [];
        const priorValues = take(earlier, type);
        if (priorValues) prior[type] = priorValues;
      }
      const lastPlayed = games[0] ? new Date(games[0].date).getTime() : null;
      out[player.name] = {
        series,
        prior,
        versus: against,
        context: contextOf(recent),
        priorContext: contextOf(earlier),
        lastPlayed: Number.isFinite(lastPlayed) ? lastPlayed : null,
        opponent: player.opponentName || player.opponentAbbr || '',
      };
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, unique.length) }, worker));
  return out;
}
