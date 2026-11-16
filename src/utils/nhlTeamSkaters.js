const GOALIE = new Set(['G', 'GK']);

const ABBR = {
  NJ: 'NJD',
  TB: 'TBL',
  LA: 'LAK',
  SJ: 'SJS',
  WAS: 'WSH',
  MON: 'MTL',
  VEG: 'VGK',
  UTAH: 'UTA',
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

export function skatersFromRoster(groups) {
  const rows = [];
  for (const group of groups || []) {
    for (const player of group?.items || []) {
      const position = String(player?.position?.abbreviation || '').toUpperCase();
      if (!player?.id || GOALIE.has(position)) continue;
      rows.push({
        id: String(player.id),
        name: player.shortName || player.displayName || '',
        fullName: player.displayName || '',
        position,
        headshot: player.headshot?.href || '',
        jersey: player.jersey || '',
      });
    }
  }
  return rows;
}

export function gamesFromNhlLog(data) {
  const names = data?.names || [];
  const goalsIndex = names.indexOf('goals');
  const assistsIndex = names.indexOf('assists');
  const pointsIndex = names.indexOf('points');
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
        const goals = statAt(event.stats, goalsIndex);
        const assists = statAt(event.stats, assistsIndex);
        games.push({
          id: String(event.eventId),
          date: meta.gameDate,
          opponentId: String(meta.opponent?.id || ''),
          opponentAbbr: meta.opponent?.abbreviation || '',
          opponentName: meta.opponent?.displayName || '',
          goals,
          assists,
          points: pointsIndex >= 0 ? statAt(event.stats, pointsIndex) : goals + assists,
        });
      }
    }
  }
  games.sort((a, b) => new Date(b.date) - new Date(a.date));
  return games;
}

export function mergeGames(lists) {
  const seen = new Set();
  const games = [];
  for (const list of lists || []) {
    for (const game of list || []) {
      if (!game?.id || seen.has(game.id)) continue;
      seen.add(game.id);
      games.push(game);
    }
  }
  games.sort((a, b) => new Date(b.date) - new Date(a.date));
  return games;
}

export function seasonTotals(games) {
  return (games || []).reduce((total, game) => ({
    goals: total.goals + game.goals,
    assists: total.assists + game.assists,
    points: total.points + game.points,
  }), { goals: 0, assists: 0, points: 0 });
}

export const NHL_CATEGORIES = [
  { key: 'points', label: 'PTS', word: 'points' },
  { key: 'goals', label: 'G', word: 'goals' },
  { key: 'assists', label: 'A', word: 'assists' },
];

export function statSeries(games, key, limit = 10) {
  return (games || []).slice(0, limit).map((game) => game?.[key] || 0).reverse();
}

export function pointSeries(games, limit = 10) {
  return statSeries(games, 'points', limit);
}

export function facesOpponent(game, opponent) {
  if (!game || !opponent) return false;
  if (game.opponentId && opponent.id && String(game.opponentId) === String(opponent.id)) return true;
  const abbr = canon(game.opponentAbbr);
  const want = canon(opponent.abbreviation);
  if (abbr && want && abbr === want) return true;
  const name = String(opponent.name || '').toLowerCase();
  return Boolean(name) && String(game.opponentName || '').toLowerCase().includes(name);
}

export function nextOpponent(events, teamId, now = Date.now()) {
  const rows = [...(events || [])].sort((a, b) => new Date(a.date) - new Date(b.date));
  for (const event of rows) {
    const comp = event?.competitions?.[0];
    const state = comp?.status?.type?.state;
    if (state === 'post') continue;
    const when = new Date(event.date).getTime();
    if (state !== 'in' && Number.isFinite(when) && when < now - 12 * 60 * 60 * 1000) continue;
    const opponent = (comp?.competitors || []).find((side) => String(side?.team?.id) !== String(teamId));
    if (!opponent?.team?.id) continue;
    const mine = (comp?.competitors || []).find((side) => String(side?.team?.id) === String(teamId));
    return {
      id: String(opponent.team.id),
      abbreviation: opponent.team.abbreviation || '',
      name: opponent.team.shortDisplayName || opponent.team.displayName || '',
      home: mine?.homeAway === 'home',
      date: event.date,
      state: state || 'pre',
    };
  }
  return null;
}

export function sortSkaters(rows, key, dir) {
  const sign = dir === 'asc' ? 1 : -1;
  return [...(rows || [])].sort((a, b) => {
    const delta = (Number(a?.[key]) || 0) - (Number(b?.[key]) || 0);
    if (delta) return delta * sign;
    return String(a?.name || '').localeCompare(String(b?.name || ''));
  });
}

export function chartMax(series) {
  return Math.max(1, ...series.flat(), 0);
}
