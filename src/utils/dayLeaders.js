/** Today's box-score leaders for NBA, NHL, NFL, and MLB. */

export const DAY_SPORTS = ['nba', 'nhl', 'nfl', 'mlb'];

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

/** NFL and MLB split into leader lists. Each list has its own columns. */
export const DAY_GROUPS = {
  nfl: {
    passing: {
      label: 'Passing',
      defaultSort: 'passingYards',
      columns: [
        { key: 'passingYards', label: 'YDS' },
        { key: 'passingTouchdowns', label: 'TD' },
        { key: 'interceptions', label: 'INT' },
      ],
    },
    rushing: {
      label: 'Rushing',
      defaultSort: 'rushingYards',
      columns: [
        { key: 'rushingYards', label: 'YDS' },
        { key: 'carries', label: 'CAR' },
        { key: 'rushingTouchdowns', label: 'TD' },
      ],
    },
    receiving: {
      label: 'Receiving',
      defaultSort: 'receivingYards',
      columns: [
        { key: 'receivingYards', label: 'YDS' },
        { key: 'receptions', label: 'REC' },
        { key: 'receivingTouchdowns', label: 'TD' },
      ],
    },
  },
  mlb: {
    hitting: {
      label: 'Hitting',
      defaultSort: 'homeRuns',
      columns: [
        { key: 'homeRuns', label: 'HR' },
        { key: 'hits', label: 'H' },
        { key: 'rbi', label: 'RBI' },
        { key: 'steals', label: 'SB' },
      ],
    },
    pitching: {
      label: 'Pitching',
      defaultSort: 'strikeouts',
      columns: [
        { key: 'strikeouts', label: 'K' },
        { key: 'innings', label: 'IP' },
      ],
    },
  },
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

function ordinalPeriod(period) {
  const n = Number(period);
  if (n === 1) return '1st';
  if (n === 2) return '2nd';
  if (n === 3) return '3rd';
  if (n === 4) return '4th';
  if (n > 4) return `OT${n - 4}`;
  return '';
}

/** Score, and for a live game the period and time remaining. */
export function gameSituation(status, competitors) {
  const type = status?.type || {};
  const live = type.state === 'in';
  const sides = competitors || [];
  const away = sides.find((c) => c.homeAway === 'away') || sides[0];
  const home = sides.find((c) => c.homeAway === 'home') || sides[1];
  const shown = (side) => {
    if (side?.score == null || side.score === '') return '';
    return `${side.team?.abbreviation || ''} ${side.score}`.trim();
  };
  const awayScore = shown(away);
  const homeScore = shown(home);
  const score = awayScore && homeScore ? `${awayScore}, ${homeScore}` : '';
  const displayClock = String(status?.displayClock || '').trim();
  const clock = live && displayClock && displayClock !== '0:00' && displayClock !== '0.0' ? displayClock : '';
  let period = '';
  if (live) {
    const detail = String(type.shortDetail || type.detail || '').trim();
    period = detail
      .replace(displayClock, '')
      .replace(/\s*-\s*/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!period) period = ordinalPeriod(status?.period);
  }
  return { live, score, period, clock };
}

export function formatGameLine(row) {
  const live = row?.live ? [row.clock, row.period].filter(Boolean).join(' ') : '';
  return [row?.score, live].filter(Boolean).join(' · ');
}

function playerIdentity(athlete, team, game) {
  const person = athlete?.athlete || {};
  if (!person.id) return null;
  const comp = game?.competitions?.[0] || {};
  const comps = comp.competitors || [];
  const mine = comps.find((c) => String(c.team?.id) === String(team?.id));
  const other = comps.find((c) => c !== mine);
  const situation = gameSituation(comp.status, comps);
  const headshot = typeof person.headshot === 'string' ? person.headshot : person.headshot?.href || '';
  return {
    id: String(person.id),
    name: person.shortName || person.displayName || 'Player',
    position: person.position?.abbreviation || athlete.position?.abbreviation || '',
    team: team?.abbreviation || '',
    opponent: other?.team?.abbreviation || '',
    home: mine?.homeAway !== 'away',
    headshot,
    ...situation,
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

function groupNamed(side, name) {
  return (side?.statistics || []).find((group) => String(group.name || group.type || '').toLowerCase() === name);
}

function slashCount(value, index) {
  const text = String(value || '');
  if (!text.includes('/')) return numberStat(text) ?? 0;
  return numberStat(text.split('/')[index]) ?? 0;
}

function nflPlayers(summary, game) {
  const rows = [];
  for (const side of summary?.boxscore?.players || []) {
    const passing = groupNamed(side, 'passing');
    const rushing = groupNamed(side, 'rushing');
    const receiving = groupNamed(side, 'receiving');
    for (const athlete of passing?.athletes || []) {
      if (athlete.didNotPlay) continue;
      const stats = statMap(passing.keys || passing.names, athlete.stats);
      const attempts = slashCount(stats['completions/passingAttempts'], 1);
      const yards = numberStat(stats.passingYards) ?? 0;
      const touchdowns = numberStat(stats.passingTouchdowns) ?? 0;
      const interceptions = numberStat(stats.interceptions) ?? 0;
      if (!(attempts > 0 || yards !== 0 || touchdowns > 0 || interceptions > 0)) continue;
      const who = playerIdentity(athlete, side.team, game);
      if (!who) continue;
      rows.push({ ...who, line: 'passing', passingYards: yards, passingTouchdowns: touchdowns, interceptions });
    }
    for (const athlete of rushing?.athletes || []) {
      if (athlete.didNotPlay) continue;
      const stats = statMap(rushing.keys || rushing.names, athlete.stats);
      const carries = numberStat(stats.rushingAttempts) ?? 0;
      const yards = numberStat(stats.rushingYards) ?? 0;
      const touchdowns = numberStat(stats.rushingTouchdowns) ?? 0;
      if (!(carries > 0 || yards !== 0 || touchdowns > 0)) continue;
      const who = playerIdentity(athlete, side.team, game);
      if (!who) continue;
      rows.push({ ...who, line: 'rushing', carries, rushingYards: yards, rushingTouchdowns: touchdowns });
    }
    for (const athlete of receiving?.athletes || []) {
      if (athlete.didNotPlay) continue;
      const stats = statMap(receiving.keys || receiving.names, athlete.stats);
      const receptions = numberStat(stats.receptions) ?? 0;
      const yards = numberStat(stats.receivingYards) ?? 0;
      const touchdowns = numberStat(stats.receivingTouchdowns) ?? 0;
      if (!(receptions > 0 || yards !== 0 || touchdowns > 0)) continue;
      const who = playerIdentity(athlete, side.team, game);
      if (!who) continue;
      rows.push({ ...who, line: 'receiving', receptions, receivingYards: yards, receivingTouchdowns: touchdowns });
    }
  }
  return rows;
}

function stolenBasesById(summary) {
  const map = new Map();
  for (const side of summary?.rosters || []) {
    for (const player of side.roster || []) {
      const id = player.athlete?.id;
      if (!id) continue;
      const stat = (player.stats || []).find((item) => item.name === 'stolenBases');
      const value = numberStat(stat?.value ?? stat?.displayValue);
      if (value != null) map.set(String(id), value);
    }
  }
  return map;
}

function mlbPlayers(summary, game) {
  const steals = stolenBasesById(summary);
  const rows = [];
  for (const side of summary?.boxscore?.players || []) {
    const batting = groupNamed(side, 'batting');
    const pitching = groupNamed(side, 'pitching');
    for (const athlete of batting?.athletes || []) {
      if (athlete.didNotPlay) continue;
      const stats = statMap(batting.keys || batting.names, athlete.stats);
      const who = playerIdentity(athlete, side.team, game);
      if (!who) continue;
      const hits = numberStat(stats.hits) ?? 0;
      const homeRuns = numberStat(stats.homeRuns) ?? 0;
      const rbi = numberStat(stats.RBIs) ?? 0;
      const stolen = steals.get(who.id) ?? 0;
      const atBats = numberStat(stats.atBats) ?? 0;
      if (!(atBats > 0 || hits > 0 || homeRuns > 0 || rbi > 0 || stolen > 0)) continue;
      rows.push({ ...who, line: 'hitting', hits, homeRuns, rbi, steals: stolen });
    }
    for (const athlete of pitching?.athletes || []) {
      if (athlete.didNotPlay) continue;
      const stats = statMap(pitching.keys || pitching.names, athlete.stats);
      const innings = numberStat(stats['fullInnings.partInnings']) ?? 0;
      const strikeouts = numberStat(stats.strikeouts) ?? 0;
      if (!(innings > 0 || strikeouts > 0)) continue;
      const who = playerIdentity(athlete, side.team, game);
      if (!who) continue;
      rows.push({ ...who, line: 'pitching', innings, strikeouts });
    }
  }
  return rows;
}

/** Players who have actually played in this game. Goalies and DNPs are left out. */
export function playersFromBoxscore(sport, summary, game) {
  if (sport === 'nba') return nbaPlayers(summary, game);
  if (sport === 'nhl') return nhlPlayers(summary, game);
  if (sport === 'nfl') return nflPlayers(summary, game);
  if (sport === 'mlb') return mlbPlayers(summary, game);
  return [];
}

function rowKey(row) {
  return row.line ? `${row.line}:${row.id}` : row.id;
}

/** One row per player. A second game on the same day adds the counting stats. */
export function combinePlayers(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = rowKey(row);
    const prev = map.get(key);
    if (!prev) {
      map.set(key, { ...row });
      continue;
    }
    const next = { ...prev, live: prev.live || row.live };
    for (const field of Object.keys(row)) {
      if (typeof row[field] === 'number') next[field] = (prev[field] || 0) + row[field];
    }
    if (row.live || !prev.live) {
      next.score = row.score;
      next.period = row.period;
      next.clock = row.clock;
      next.team = row.team;
      next.opponent = row.opponent;
      next.home = row.home;
    }
    map.set(key, next);
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
  if (key === 'innings') return value.toFixed(1);
  return String(value);
}
