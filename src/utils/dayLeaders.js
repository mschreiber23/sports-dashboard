/** Today's box-score leaders. NBA and NHL only. */

export const DAY_SPORTS = ['nba', 'nhl'];

export const DAY_COLUMNS = {
  nba: [
    { key: 'points', label: 'PTS' },
    { key: 'rebounds', label: 'REB' },
    { key: 'assists', label: 'AST' },
    { key: 'steals', label: 'STL' },
    { key: 'blocks', label: 'BLK' },
    { key: 'turnovers', label: 'TO' },
  ],
  nhl: [
    { key: 'points', label: 'PTS' },
    { key: 'goals', label: 'G' },
    { key: 'assists', label: 'A' },
    { key: 'shots', label: 'SOG' },
    { key: 'hits', label: 'HIT' },
    { key: 'blocks', label: 'BLK' },
    { key: 'plusMinus', label: '+/-' },
  ],
};

const NHL_SKATER_GROUPS = new Set(['forwards', 'defenses', 'defensemen']);

function statMap(keys, stats) {
  const map = {};
  (keys || []).forEach((key, i) => { map[key] = stats?.[i]; });
  return map;
}

function numberStat(value) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text || text === '--' || text === '-') return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

/** True when a minutes or time-on-ice cell means the player entered the game. */
export function playedTime(value) {
  if (value == null) return false;
  const text = String(value).trim();
  if (!text || text === '--' || text === '-' || text === '0' || text === '0:00') return false;
  if (text.includes(':')) {
    const [minutes, seconds] = text.split(':');
    return Number(minutes) > 0 || Number(seconds) > 0;
  }
  const n = Number(text);
  return Number.isFinite(n) && n > 0;
}

function playerIdentity(athlete, team, game) {
  const person = athlete?.athlete || {};
  if (!person.id) return null;
  const comps = game?.competitions?.[0]?.competitors || [];
  const mine = comps.find((c) => String(c.team?.id) === String(team?.id));
  const other = comps.find((c) => c !== mine);
  const status = game?.competitions?.[0]?.status?.type || {};
  const headshot = typeof person.headshot === 'string' ? person.headshot : person.headshot?.href || '';
  return {
    id: String(person.id),
    name: person.shortName || person.displayName || 'Player',
    position: person.position?.abbreviation || athlete.position?.abbreviation || '',
    team: team?.abbreviation || '',
    opponent: other?.team?.abbreviation || '',
    home: mine?.homeAway !== 'away',
    headshot,
    live: status.state === 'in',
    clock: status.shortDetail || '',
  };
}

function nbaPlayers(summary, game) {
  const rows = [];
  for (const side of summary?.boxscore?.players || []) {
    const groups = side.statistics || [];
    const group = groups.find((s) => (s.keys || s.names || []).includes('points')) || groups[0];
    const keys = group?.keys || group?.names || [];
    for (const athlete of group?.athletes || []) {
      if (athlete.didNotPlay) continue;
      const stats = statMap(keys, athlete.stats);
      if (!playedTime(stats.minutes)) continue;
      const who = playerIdentity(athlete, side.team, game);
      if (!who) continue;
      rows.push({
        ...who,
        points: numberStat(stats.points) ?? 0,
        rebounds: numberStat(stats.rebounds) ?? 0,
        assists: numberStat(stats.assists) ?? 0,
        steals: numberStat(stats.steals) ?? 0,
        blocks: numberStat(stats.blocks) ?? 0,
        turnovers: numberStat(stats.turnovers) ?? 0,
      });
    }
  }
  return rows;
}

function nhlPlayers(summary, game) {
  const rows = [];
  for (const side of summary?.boxscore?.players || []) {
    for (const group of side.statistics || []) {
      const name = String(group.name || '').toLowerCase();
      if (!NHL_SKATER_GROUPS.has(name)) continue;
      const keys = group.keys || group.names || [];
      for (const athlete of group.athletes || []) {
        if (athlete.didNotPlay) continue;
        const stats = statMap(keys, athlete.stats);
        if (!playedTime(stats.timeOnIce)) continue;
        const who = playerIdentity(athlete, side.team, game);
        if (!who) continue;
        const goals = numberStat(stats.goals) ?? 0;
        const assists = numberStat(stats.assists) ?? 0;
        rows.push({
          ...who,
          goals,
          assists,
          points: goals + assists,
          shots: numberStat(stats.shotsTotal) ?? 0,
          hits: numberStat(stats.hits) ?? 0,
          blocks: numberStat(stats.blockedShots) ?? 0,
          plusMinus: numberStat(stats.plusMinus) ?? 0,
        });
      }
    }
  }
  return rows;
}

/** Players who have actually played in this game. Goalies and DNPs are left out. */
export function playersFromBoxscore(sport, summary, game) {
  if (sport === 'nba') return nbaPlayers(summary, game);
  if (sport === 'nhl') return nhlPlayers(summary, game);
  return [];
}

/** One row per player. A second game on the same day adds the counting stats. */
export function combinePlayers(rows) {
  const map = new Map();
  for (const row of rows) {
    const prev = map.get(row.id);
    if (!prev) {
      map.set(row.id, { ...row });
      continue;
    }
    const next = { ...prev, live: prev.live || row.live };
    for (const key of Object.keys(row)) {
      if (typeof row[key] === 'number') next[key] = (prev[key] || 0) + row[key];
    }
    map.set(row.id, next);
  }
  return [...map.values()];
}

export function sortDayLeaders(rows, key, dir = 'desc') {
  const sign = dir === 'asc' ? 1 : -1;
  return rows.slice().sort((a, b) => {
    const av = typeof a[key] === 'number' ? a[key] : null;
    const bv = typeof b[key] === 'number' ? b[key] : null;
    if (av == null && bv == null) return a.name.localeCompare(b.name);
    if (av == null) return 1;
    if (bv == null) return -1;
    if (av !== bv) return (av - bv) * sign;
    if ((b.points || 0) !== (a.points || 0)) return (b.points || 0) - (a.points || 0);
    return a.name.localeCompare(b.name);
  });
}

export function formatLeaderStat(key, value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—';
  if (key === 'plusMinus' && value > 0) return `+${value}`;
  return String(value);
}
