/** Season leader rows shaped like the StatHub board. NBA values are per game. */
import { getTeamLogo, getTeamLogoFallback } from '../api/espn.js';
import { formatLeaderStat } from './dayLeaders.js';

function parseStat(value) {
  if (value == null) return null;
  const text = String(value).trim().replace(/,/g, '');
  if (!text || text === '--' || text === '-') return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function categoryStats(schema, categories, name) {
  const cat = (categories || []).find((item) => item.name === name);
  const names = (schema || []).find((item) => item.name === name)?.names || [];
  const values = {};
  names.forEach((statName, index) => {
    values[statName] = parseStat(cat?.totals?.[index]);
  });
  return values;
}

function statValues(schema, categories) {
  const values = {};
  for (const cat of schema || []) Object.assign(values, categoryStats(schema, categories, cat.name));
  return values;
}

function count(values, name) {
  return values[name] ?? 0;
}

function perGame(stats, avgName, totalName) {
  if (typeof stats[avgName] === 'number') return stats[avgName];
  const games = count(stats, 'gamesPlayed');
  if (games > 0 && typeof stats[totalName] === 'number') return stats[totalName] / games;
  return 0;
}

function identity(athlete) {
  const team = athlete?.teams?.[0] || {};
  const headshot = athlete?.headshot;
  return {
    id: String(athlete?.id || ''),
    name: athlete?.shortName || athlete?.displayName || 'Player',
    position: athlete?.position?.abbreviation || '',
    team: athlete?.teamShortName || team.abbreviation || '',
    headshot: typeof headshot === 'string' ? headshot : headshot?.href || '',
    teamLogo: getTeamLogo(team) || '',
    teamLogoFallback: getTeamLogoFallback(team) || '',
  };
}

function nbaRows(athletes, schema) {
  const rows = [];
  for (const entry of athletes || []) {
    const stats = statValues(schema, entry.categories);
    if (!(count(stats, 'gamesPlayed') > 0)) continue;
    const who = identity(entry.athlete);
    if (!who.id) continue;
    rows.push({
      ...who,
      points: perGame(stats, 'avgPoints', 'points'),
      rebounds: perGame(stats, 'avgRebounds', 'rebounds'),
      assists: perGame(stats, 'avgAssists', 'assists'),
      steals: perGame(stats, 'avgSteals', 'steals'),
      blocks: perGame(stats, 'avgBlocks', 'blocks'),
      turnovers: perGame(stats, 'avgTurnovers', 'turnovers'),
    });
  }
  return rows;
}

function nhlRows(athletes, schema, extras = {}) {
  const rows = [];
  for (const entry of athletes || []) {
    const position = String(entry.athlete?.position?.abbreviation || '').toUpperCase();
    if (position === 'G' || position === 'GK') continue;
    const stats = statValues(schema, entry.categories);
    if (!(count(stats, 'games') > 0)) continue;
    const who = identity(entry.athlete);
    if (!who.id) continue;
    const goals = count(stats, 'goals');
    const assists = count(stats, 'assists');
    const extra = extras[who.id] || {};
    rows.push({
      ...who,
      goals,
      assists,
      points: count(stats, 'points') || goals + assists,
      shots: count(stats, 'shotsTotal'),
      hits: extra.hits ?? null,
      blocks: extra.blocks ?? null,
      plusMinus: stats.plusMinus ?? 0,
    });
  }
  return rows;
}

function playedPassing(stats) {
  return count(stats, 'completions') > 0
    || count(stats, 'passingAttempts') > 0
    || count(stats, 'passingYards') !== 0
    || count(stats, 'passingTouchdowns') > 0
    || count(stats, 'interceptions') > 0;
}

function playedRushing(stats) {
  return count(stats, 'rushingAttempts') > 0
    || count(stats, 'rushingYards') !== 0
    || count(stats, 'rushingTouchdowns') > 0;
}

function playedReceiving(stats) {
  return count(stats, 'receptions') > 0
    || count(stats, 'receivingTargets') > 0
    || count(stats, 'receivingYards') !== 0
    || count(stats, 'receivingTouchdowns') > 0;
}

function nflRows(athletes, schema) {
  const rows = [];
  for (const entry of athletes || []) {
    const passing = categoryStats(schema, entry.categories, 'passing');
    const rushing = categoryStats(schema, entry.categories, 'rushing');
    const receiving = categoryStats(schema, entry.categories, 'receiving');
    const who = identity(entry.athlete);
    if (!who.id) continue;
    const fumblesLost = count(rushing, 'rushingFumblesLost') + count(receiving, 'receivingFumblesLost');
    if (playedPassing(passing)) {
      rows.push({
        ...who,
        line: 'passing',
        completions: count(passing, 'completions'),
        passingAttempts: count(passing, 'passingAttempts'),
        passingYards: count(passing, 'passingYards'),
        passingTouchdowns: count(passing, 'passingTouchdowns'),
        interceptions: count(passing, 'interceptions'),
        carries: count(rushing, 'rushingAttempts'),
        rushingYards: count(rushing, 'rushingYards'),
        rushingTouchdowns: count(rushing, 'rushingTouchdowns'),
        fumblesLost,
      });
    }
    if (playedRushing(rushing)) {
      rows.push({
        ...who,
        line: 'rushing',
        carries: count(rushing, 'rushingAttempts'),
        rushingYards: count(rushing, 'rushingYards'),
        rushingTouchdowns: count(rushing, 'rushingTouchdowns'),
        receptions: count(receiving, 'receptions'),
        targets: count(receiving, 'receivingTargets'),
        receivingYards: count(receiving, 'receivingYards'),
        receivingTouchdowns: count(receiving, 'receivingTouchdowns'),
        fumblesLost,
      });
    }
    if (playedReceiving(receiving)) {
      rows.push({
        ...who,
        line: 'receiving',
        receptions: count(receiving, 'receptions'),
        targets: count(receiving, 'receivingTargets'),
        receivingYards: count(receiving, 'receivingYards'),
        receivingTouchdowns: count(receiving, 'receivingTouchdowns'),
        fumblesLost,
      });
    }
  }
  return rows;
}

function mlbRows(athletes, schema) {
  const rows = [];
  for (const entry of athletes || []) {
    const who = identity(entry.athlete);
    if (!who.id) continue;
    const batting = categoryStats(schema, entry.categories, 'batting');
    const pitching = categoryStats(schema, entry.categories, 'pitching');
    const hits = count(batting, 'hits');
    const homeRuns = count(batting, 'homeRuns');
    const rbi = count(batting, 'RBIs');
    const steals = count(batting, 'stolenBases');
    if (count(batting, 'atBats') > 0 || hits > 0 || homeRuns > 0 || rbi > 0 || steals > 0) {
      rows.push({ ...who, line: 'hitting', hits, homeRuns, rbi, steals });
    }
    const innings = pitching.innings ?? 0;
    const strikeouts = count(pitching, 'strikeouts');
    if (innings > 0 || strikeouts > 0) {
      rows.push({ ...who, line: 'pitching', innings, strikeouts });
    }
  }
  return rows;
}

function categoryHasNumbers(cat) {
  return (cat?.totals || []).some((value) => {
    const text = String(value ?? '').trim();
    return text && text !== '-' && text !== '--';
  });
}

/** MLB returns hitters and pitchers as separate lists. Combine them by player. */
export function mergeSeasonAthletes(groups) {
  const byId = new Map();
  for (const athletes of groups) {
    for (const entry of athletes || []) {
      const id = String(entry?.athlete?.id || '');
      if (!id) continue;
      const existing = byId.get(id);
      if (!existing) {
        byId.set(id, {
          athlete: entry.athlete,
          categories: (entry.categories || []).map((cat) => ({ ...cat })),
        });
        continue;
      }
      for (const cat of entry.categories || []) {
        const prev = existing.categories.find((item) => item.name === cat.name);
        if (!prev) existing.categories.push({ ...cat });
        else if (!categoryHasNumbers(prev) && categoryHasNumbers(cat)) Object.assign(prev, cat);
      }
    }
  }
  return [...byId.values()];
}

export function rowsFromSeasonAthletes(sport, athletes, schema, extras) {
  if (sport === 'nba') return nbaRows(athletes, schema);
  if (sport === 'nhl') return nhlRows(athletes, schema, extras);
  if (sport === 'nfl') return nflRows(athletes, schema);
  if (sport === 'mlb') return mlbRows(athletes, schema);
  return [];
}

export function formatSeasonStat(sport, key, value) {
  if (sport === 'nba') {
    if (typeof value !== 'number' || Number.isNaN(value)) return '—';
    return value.toFixed(1);
  }
  return formatLeaderStat(key, value);
}

export function nhlHitBlock(payload) {
  const defensive = (payload?.splits?.categories || []).find((cat) => cat.name === 'defensive');
  const read = (name) => {
    const stat = (defensive?.stats || []).find((item) => item.name === name);
    const n = Number(stat?.value ?? stat?.displayValue);
    return Number.isFinite(n) ? n : 0;
  };
  return { hits: read('hits'), blocks: read('blockedShots') };
}
