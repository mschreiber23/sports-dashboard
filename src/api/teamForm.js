// Recent team scores for the game-line read. A new season is filled out
// with the end of the previous one so the first weeks still have a sample.
// A game from this season counts fully. A game from last season counts as a third.

const PREVIOUS_SEASON_WEIGHT = 1 / 3;

const PATH = {
  nhl: 'hockey/nhl',
  nfl: 'football/nfl',
};

const ALT = {
  TBL: 'TB',
  SJS: 'SJ',
  LAK: 'LA',
  JAC: 'JAX',
  WAS: 'WSH',
};

const cache = new Map();

export function espnAbbr(abbr) {
  const key = String(abbr || '').toUpperCase();
  return ALT[key] || key;
}

async function fetchSchedule(path, abbr, season) {
  const query = season ? `?season=${season}` : '';
  const res = await fetch(`https://site.web.api.espn.com/apis/site/v2/sports/${path}/teams/${abbr.toLowerCase()}/schedule${query}`);
  if (!res.ok) return null;
  const data = await res.json();
  return {
    year: data.season?.year || data.requestedSeason?.year || null,
    events: data.events || [],
  };
}

function rowsFrom(events, abbr) {
  const rows = [];
  for (const event of events || []) {
    const competition = event.competitions?.[0];
    const comps = competition?.competitors || [];
    const me = comps.find((comp) => String(comp.team?.abbreviation || '').toUpperCase() === abbr);
    const opp = comps.find((comp) => comp !== me);
    if (!me || !opp) continue;
    const gf = Number(me.score?.value);
    const ga = Number(opp.score?.value);
    const done = Boolean(competition.status?.type?.completed) && Number.isFinite(gf) && Number.isFinite(ga);
    rows.push({
      date: new Date(event.date).getTime(),
      home: me.homeAway === 'home',
      opp: String(opp.team?.abbreviation || '').toUpperCase(),
      gf: done ? gf : null,
      ga: done ? ga : null,
      done,
    });
  }
  return rows.filter((row) => Number.isFinite(row.date));
}

async function loadTeam(league, abbr) {
  const path = PATH[league];
  const espn = espnAbbr(abbr);
  if (!path || !espn) return null;
  let schedule = await fetchSchedule(path, espn);
  if (!schedule && espn !== abbr) schedule = await fetchSchedule(path, abbr);
  if (!schedule) return null;
  const used = schedule.events.some((event) => (
    (event.competitions?.[0]?.competitors || []).some((comp) => String(comp.team?.abbreviation || '').toUpperCase() === espn)
  )) ? espn : abbr.toUpperCase();
  let rows = rowsFrom(schedule.events, used).map((row) => ({ ...row, current: true }));
  const done = rows.filter((row) => row.done).length;
  if (done < 10 && schedule.year) {
    const prev = await fetchSchedule(path, used, schedule.year - 1);
    if (prev) rows = rowsFrom(prev.events, used).map((row) => ({ ...row, current: false })).concat(rows);
  }
  const byGame = new Map();
  for (const row of rows) {
    const id = `${row.date}|${row.opp}`;
    const existing = byGame.get(id);
    if (!existing || row.current) byGame.set(id, row);
  }
  rows = [...byGame.values()].sort((a, b) => a.date - b.date);
  return {
    abbr: used,
    rows,
    recent: rows.filter((row) => row.done).slice(-10).map((row) => ({
      gf: row.gf,
      ga: row.ga,
      weight: row.current ? 1 : PREVIOUS_SEASON_WEIGHT,
    })),
  };
}

export function teamRecentGames(league, abbr) {
  const key = `${league}|${espnAbbr(abbr)}`;
  if (!cache.has(key)) cache.set(key, loadTeam(league, abbr).catch(() => null));
  return cache.get(key);
}

export function homeSide(rows, oppAbbr, gameStart) {
  const opp = espnAbbr(oppAbbr);
  let best = null;
  let gap = Infinity;
  for (const row of rows || []) {
    if (row.opp !== opp && row.opp !== String(oppAbbr || '').toUpperCase()) continue;
    const next = Math.abs(row.date - gameStart);
    if (next < gap) {
      gap = next;
      best = row;
    }
  }
  if (!best || gap > 36 * 60 * 60 * 1000) return null;
  return best.home;
}
