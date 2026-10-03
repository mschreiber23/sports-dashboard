import { applySeasonAverage } from '../utils/propHit';

const STAT_SPORTS = new Set(['nfl', 'nba', 'wnba', 'mlb']);

const OVERVIEW_AVG = {
  points: 'avgPoints',
  rebounds: 'avgRebounds',
  assists: 'avgAssists',
};

const COUNTING = {
  receiving_yards: 'receivingYards',
  receptions: 'receptions',
  rushing_yards: 'rushingYards',
  passing_yards: 'passingYards',
  passing_touchdowns: 'passingTouchdowns',
  baseball_player_hits: 'hits',
  hits: 'hits',
  baseball_player_home_runs: 'homeRuns',
  home_runs: 'homeRuns',
  baseball_player_rbis: 'RBIs',
  rbis: 'RBIs',
};

const UNIT = {
  points: 'PPG',
  rebounds: 'RPG',
  assists: 'APG',
  assists_points_rebounds: 'PRA',
  receiving_yards: 'yds/g',
  rushing_yards: 'yds/g',
  passing_yards: 'yds/g',
  receptions: 'rec/g',
  passing_touchdowns: 'TD/g',
  anytime_touchdowns: 'TD/g',
  first_touchdowns: 'TD/g',
  two_plus_touchdowns: 'TD/g',
  baseball_player_hits: 'H/g',
  hits: 'H/g',
  baseball_player_home_runs: 'HR/g',
  home_runs: 'HR/g',
  baseball_player_rbis: 'RBI/g',
  rbis: 'RBI/g',
  baseball_player_total_bases: 'TB/g',
};

const PATH = {
  nfl: ['football', 'nfl', 'gamelog'],
  nba: ['basketball', 'nba', 'overview'],
  wnba: ['basketball', 'wnba', 'overview'],
  mlb: ['baseball', 'mlb', 'overview'],
};

function normName(name) {
  return String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '');
}

async function searchAthlete(name, league) {
  const res = await fetch(`https://site.api.espn.com/apis/search/v2?query=${encodeURIComponent(name)}&limit=5`);
  if (!res.ok) return null;
  const data = await res.json();
  const contents = (data.results || []).find((r) => r.type === 'player')?.contents || [];
  const want = normName(name);
  const hit = contents.find((c) => {
    const leagueOk = (c.defaultLeagueSlug || '').toLowerCase() === league
      || (c.description || '').toLowerCase() === league;
    return leagueOk && normName(c.displayName) === want;
  });
  const id = hit?.uid?.match(/a:(\d+)/)?.[1];
  return id || null;
}

function splitStats(statistics) {
  const names = statistics?.names || [];
  const splits = statistics?.splits || [];
  const reg = splits.find((s) => /regular/i.test(s.displayName)) || splits[0];
  if (!reg?.stats) return null;
  const value = (key) => {
    const idx = names.indexOf(key);
    if (idx < 0) return null;
    const n = Number(reg.stats[idx]);
    return Number.isFinite(n) ? n : null;
  };
  return { value, gp: value('gamesPlayed') };
}

function perGameFromLog(log, statName) {
  const names = log?.names || [];
  const idx = names.indexOf(statName);
  if (idx < 0) return null;
  const events = log.seasonTypes?.[0]?.categories?.[0]?.events || [];
  let sum = 0;
  let n = 0;
  for (const ev of events) {
    const raw = ev.stats?.[idx];
    if (raw == null || raw === '-' || raw === '') continue;
    const v = Number(raw);
    if (!Number.isFinite(v)) continue;
    sum += v;
    n += 1;
  }
  if (n < 2) return null;
  return sum / n;
}

function tdPerGame(log) {
  const names = log?.names || [];
  const idxs = ['receivingTouchdowns', 'rushingTouchdowns', 'passingTouchdowns']
    .map((n) => names.indexOf(n))
    .filter((i) => i >= 0);
  if (!idxs.length) return null;
  const events = log.seasonTypes?.[0]?.categories?.[0]?.events || [];
  let sum = 0;
  let n = 0;
  for (const ev of events) {
    let td = 0;
    let any = false;
    for (const idx of idxs) {
      const raw = ev.stats?.[idx];
      if (raw == null || raw === '-' || raw === '') continue;
      const v = Number(raw);
      if (!Number.isFinite(v)) continue;
      td += v;
      any = true;
    }
    if (!any) continue;
    sum += td;
    n += 1;
  }
  if (n < 2) return null;
  return sum / n;
}

async function loadAverages(league, athleteId) {
  const [sport, lg, mode] = PATH[league];
  if (mode === 'gamelog') {
    const res = await fetch(`https://site.api.espn.com/apis/common/v3/sports/${sport}/${lg}/athletes/${athleteId}/gamelog`);
    if (!res.ok) return null;
    const log = await res.json();
    const avg = {};
    for (const [type, stat] of Object.entries(COUNTING)) {
      if (!['receivingYards', 'receptions', 'rushingYards', 'passingYards', 'passingTouchdowns'].includes(stat)) continue;
      const v = perGameFromLog(log, stat);
      if (v != null) avg[type] = v;
    }
    const td = tdPerGame(log);
    if (td != null) {
      avg.anytime_touchdowns = td;
      avg.two_plus_touchdowns = td;
    }
    return avg;
  }
  const res = await fetch(`https://site.web.api.espn.com/apis/common/v3/sports/${sport}/${lg}/athletes/${athleteId}/overview`);
  if (!res.ok) return null;
  const data = await res.json();
  const split = splitStats(data.statistics);
  if (!split) return null;
  const avg = {};
  if (league === 'nba' || league === 'wnba') {
    for (const [type, key] of Object.entries(OVERVIEW_AVG)) {
      const v = split.value(key);
      if (v != null) avg[type] = v;
    }
    if (avg.points != null && avg.rebounds != null && avg.assists != null) {
      avg.assists_points_rebounds = avg.points + avg.rebounds + avg.assists;
    }
    return avg;
  }
  const gp = split.gp;
  if (!(gp >= 10)) return null;
  for (const [type, key] of Object.entries(COUNTING)) {
    const total = split.value(key);
    if (total != null) avg[type] = total / gp;
  }
  const h = split.value('hits');
  const d2 = split.value('doubles');
  const d3 = split.value('triples');
  const hr = split.value('homeRuns');
  if (h != null && d2 != null && d3 != null && hr != null) {
    avg.baseball_player_total_bases = (h + d2 + 2 * d3 + 3 * hr) / gp;
  }
  return avg;
}

function targetsFrom(rows) {
  const picked = [];
  const seen = new Set();
  const byLeague = new Map();
  for (const row of rows) {
    if (!STAT_SPORTS.has(row.league) || !UNIT[row.type]) continue;
    if (!byLeague.has(row.league)) byLeague.set(row.league, []);
    byLeague.get(row.league).push(row);
  }
  for (const list of byLeague.values()) {
    const ranked = [...list].sort((a, b) => b.hit - a.hit);
    for (const row of ranked) {
      const key = `${row.league}|${normName(row.player)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      picked.push(row);
      if (picked.filter((p) => p.league === row.league).length >= 8) break;
    }
  }
  return picked.slice(0, 32);
}

export async function attachSeasonStats(rows) {
  const targets = targetsFrom(rows);
  const averages = new Map();
  let cursor = 0;
  async function worker() {
    while (cursor < targets.length) {
      const row = targets[cursor++];
      const key = `${row.league}|${normName(row.player)}`;
      try {
        const id = await searchAthlete(row.player, row.league);
        if (!id) continue;
        const avg = await loadAverages(row.league, id);
        if (avg) averages.set(key, avg);
      } catch { /* one player should not blank the page */ }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, targets.length) }, worker));

  return rows.map((row) => {
    const avgMap = averages.get(`${row.league}|${normName(row.player)}`);
    const avg = avgMap?.[row.type];
    if (avg == null || row.line == null) return row;
    const next = applySeasonAverage(row, avg, row.line, row.type);
    return {
      ...next,
      seasonAvg: avg,
      seasonUnit: UNIT[row.type] || '',
    };
  });
}

export function formatAvg(n) {
  if (n == null || Number.isNaN(n)) return '';
  return n >= 10 ? n.toFixed(1) : n.toFixed(2).replace(/0$/, '').replace(/\.$/, '');
}
