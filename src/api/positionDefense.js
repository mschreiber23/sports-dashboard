// How a defense has been scored on, by position, from recent box scores.
// A center or a winger, and a guard, forward, or center, only moves when that
// group has been taking more or less of the production than it usually does.
// Pace, opponent turnovers, and offensive rebounds come from the team page.

import { espnAbbr } from './teamForm.js';

const PATH = { nhl: 'hockey/nhl', nba: 'basketball/nba' };
const CORE = { nba: 'basketball/leagues/nba' };

export const HOCKEY_POINT_SHARE = { C: 0.27, W: 0.5, D: 0.23 };
export const NBA_SHARE = {
  pts: { G: 0.47, F: 0.38, C: 0.15 },
  reb: { G: 0.35, F: 0.47, C: 0.18 },
  ast: { G: 0.6, F: 0.32, C: 0.08 },
};

const HOCKEY_PRIOR = 18;
const NBA_PRIOR = { pts: 220, reb: 90, ast: 50 };
const MIN_GAMES = 3;

const cache = new Map();

export function hockeyGroup(position) {
  const abbr = String(position || '').toUpperCase();
  if (abbr === 'C') return 'C';
  if (abbr === 'LW' || abbr === 'RW' || abbr === 'W') return 'W';
  if (abbr === 'D' || abbr === 'LD' || abbr === 'RD') return 'D';
  return '';
}

export function nbaGroup(position) {
  const abbr = String(position || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (!abbr) return '';
  if (abbr === 'C') return 'C';
  if (abbr === 'G' || abbr === 'PG' || abbr === 'SG') return 'G';
  if (abbr === 'F' || abbr === 'SF' || abbr === 'PF' || abbr === 'GF' || abbr === 'FG') return 'F';
  if (abbr.endsWith('C')) return 'C';
  if (abbr.includes('G')) return 'G';
  if (abbr.includes('F')) return 'F';
  return '';
}

export function shareIndex(count, total, typical, prior) {
  if (!(total > 0) || !(typical > 0) || !(prior > 0)) return null;
  const shrunk = (count + typical * prior) / (total + prior);
  return shrunk / typical;
}

export function hockeyIndex(profile, position) {
  const group = hockeyGroup(position);
  if (!profile || profile.games < MIN_GAMES || !group || !HOCKEY_POINT_SHARE[group]) return null;
  const points = profile.points || {};
  const total = (points.C || 0) + (points.W || 0) + (points.D || 0);
  return shareIndex(points[group] || 0, total, HOCKEY_POINT_SHARE[group], HOCKEY_PRIOR);
}

export function nbaIndex(profile, position, stat) {
  const group = nbaGroup(position);
  const typical = NBA_SHARE[stat]?.[group];
  if (!profile || profile.games < MIN_GAMES || !typical) return null;
  const allowed = profile.allowed || {};
  const total = ['G', 'F', 'C'].reduce((sum, key) => sum + (allowed[key]?.[stat] || 0), 0);
  return shareIndex(allowed[group]?.[stat] || 0, total, typical, NBA_PRIOR[stat]);
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function statAt(athlete, keys, name) {
  const index = keys.indexOf(name);
  if (index < 0) return 0;
  return num(athlete?.stats?.[index]);
}

export function hockeyAllowed(box, teamId) {
  const teams = box?.boxscore?.players || [];
  const opp = teams.find((team) => String(team.team?.id) !== String(teamId));
  if (!opp) return null;
  const points = { C: 0, W: 0, D: 0 };
  let any = false;
  for (const group of opp.statistics || []) {
    if (group.name !== 'forwards' && group.name !== 'defenses') continue;
    const keys = group.keys || [];
    for (const athlete of group.athletes || []) {
      const bucket = hockeyGroup(athlete.athlete?.position?.abbreviation);
      if (!bucket) continue;
      any = true;
      points[bucket] += statAt(athlete, keys, 'goals') + statAt(athlete, keys, 'assists');
    }
  }
  return any ? points : null;
}

export function nbaAllowed(box, teamId) {
  const teams = box?.boxscore?.players || [];
  const opp = teams.find((team) => String(team.team?.id) !== String(teamId));
  const stat = opp?.statistics?.[0];
  if (!stat) return null;
  const keys = stat.keys || [];
  const allowed = {
    G: { pts: 0, reb: 0, ast: 0 },
    F: { pts: 0, reb: 0, ast: 0 },
    C: { pts: 0, reb: 0, ast: 0 },
  };
  let any = false;
  for (const athlete of stat.athletes || []) {
    if (athlete.didNotPlay) continue;
    const bucket = nbaGroup(athlete.athlete?.position?.abbreviation);
    if (!bucket) continue;
    any = true;
    allowed[bucket].pts += statAt(athlete, keys, 'points');
    allowed[bucket].reb += statAt(athlete, keys, 'rebounds');
    allowed[bucket].ast += statAt(athlete, keys, 'assists');
  }
  return any ? allowed : null;
}

function statMap(data) {
  const map = {};
  for (const category of data?.splits?.categories || []) {
    for (const stat of category.stats || []) {
      if (typeof stat.value === 'number' && Number.isFinite(stat.value)) map[stat.name] = stat.value;
    }
  }
  return map;
}

async function boxAllowed(league, eventId, teamId) {
  const res = await fetch(`https://site.web.api.espn.com/apis/site/v2/sports/${PATH[league]}/summary?event=${eventId}`);
  if (!res.ok) return null;
  const box = await res.json();
  return league === 'nhl' ? hockeyAllowed(box, teamId) : nbaAllowed(box, teamId);
}

async function build(league, abbr) {
  const path = PATH[league];
  if (!path) return null;
  const res = await fetch(`https://site.web.api.espn.com/apis/site/v2/sports/${path}/teams/${abbr.toLowerCase()}/schedule`);
  if (!res.ok) return null;
  const data = await res.json();
  const teamId = data.team?.id;
  if (!teamId) return null;
  const games = (data.events || []).filter((event) => {
    const competition = event.competitions?.[0];
    if (!competition?.status?.type?.completed) return false;
    const seasonType = event.seasonType?.type ?? competition.type?.type;
    return seasonType == null || Number(seasonType) === 2;
  }).slice(-5);
  const rows = (await Promise.all(games.map((game) => boxAllowed(league, game.id, teamId)))).filter(Boolean);
  if (league === 'nhl') {
    const points = { C: 0, W: 0, D: 0 };
    for (const row of rows) {
      points.C += row.C;
      points.W += row.W;
      points.D += row.D;
    }
    return { games: rows.length, points };
  }
  const allowed = {
    G: { pts: 0, reb: 0, ast: 0 },
    F: { pts: 0, reb: 0, ast: 0 },
    C: { pts: 0, reb: 0, ast: 0 },
  };
  for (const row of rows) {
    for (const group of ['G', 'F', 'C']) {
      allowed[group].pts += row[group].pts;
      allowed[group].reb += row[group].reb;
      allowed[group].ast += row[group].ast;
    }
  }
  let pace = null;
  let turnovers = null;
  let offRebRate = null;
  const year = data.season?.year;
  if (year && CORE[league]) {
    const statsRes = await fetch(`https://sports.core.api.espn.com/v2/sports/${CORE[league]}/seasons/${year}/types/2/teams/${teamId}/statistics/0?lang=en`);
    if (statsRes.ok) {
      const map = statMap(await statsRes.json());
      pace = map.paceFactor ?? null;
      turnovers = map.avgTurnovers ?? null;
      offRebRate = map.offReboundRate ?? null;
    }
  }
  return { games: rows.length, allowed, pace, turnovers, offRebRate };
}

export function loadDefense(league, abbr) {
  const key = `${league}|${espnAbbr(abbr, league)}`;
  if (!PATH[league] || !espnAbbr(abbr, league)) return Promise.resolve(null);
  if (!cache.has(key)) cache.set(key, build(league, espnAbbr(abbr, league)).catch(() => null));
  return cache.get(key);
}
