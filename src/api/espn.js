import axios from 'axios';

const BASE = 'https://site.api.espn.com/apis/site/v2/sports';
// Team routes on site.api.espn.com omit Access-Control-Allow-Origin, so the
// browser cannot read them. The same site v2 paths on the web host do.
const WEB = 'https://site.web.api.espn.com/apis/site/v2/sports';

/**
 * Returns the ESPN dark-mode (white) logo URL for a team object.
 * ESPN serves white logo variants at /500-dark/ instead of /500/.
 * Teams with bright logos (Reds red C, Pirates gold P) often have no dark
 * variant, so the onError fallback returns the original colored logo.
 */
function logoByRel(team, name) {
  const logos = team?.logos || [];
  return logos.find((l) => Array.isArray(l.rel) && l.rel.includes(name))?.href || null;
}

export function getTeamLogo(team) {
  const logos = team?.logos || [];
  const orig = team?.logo || logoByRel(team, 'default') || logos[0]?.href || null;
  // The Capitals primary is a wide navy wordmark. It vanishes on a dark
  // background and shrinks to a sliver in the square logo slots. Their eagle
  // is the mark that stays readable there.
  const abbr = String(team?.abbreviation || '').toUpperCase();
  const caps = (abbr === 'WSH' || abbr === 'WAS' || String(team?.id) === '23')
    && /\/teamlogos\/nhl\//.test(orig || '');
  if (caps) {
    const eagle = logoByRel(team, 'secondary_logo_on_black_color');
    if (eagle) return eagle;
  }
  // Prefer explicit dark entry from logos array
  const darkEntry = logoByRel(team, 'dark');
  if (darkEntry) return darkEntry;
  if (!orig) return null;
  // Try ESPN's standard dark URL pattern: /500/ → /500-dark/
  return orig.replace(/(\/i\/teamlogos\/[^/]+\/)(\d+)(\/)/, '$1$2-dark$3');
}

/** Original colored logo URL (used as onError fallback). */
export function getTeamLogoFallback(team) {
  return team?.logo || team?.logos?.[0]?.href || null;
}

export const SPORTS = {
  nba: { league: 'basketball/nba', label: 'NBA' },
  nfl: { league: 'football/nfl', label: 'NFL' },
  mlb: { league: 'baseball/mlb', label: 'MLB' },
  nhl: { league: 'hockey/nhl', label: 'NHL' },
};

export async function getScoreboard(sport, dateStr) {
  const { league } = SPORTS[sport];
  const url = dateStr
    ? `${BASE}/${league}/scoreboard?dates=${dateStr}`
    : `${BASE}/${league}/scoreboard`;
  const { data } = await axios.get(url);
  return data.events || [];
}

function groupLabel(position) {
  if (typeof position === 'string' && position) return position;
  if (position && typeof position === 'object') {
    return position.displayName || position.name || position.abbreviation || 'Roster';
  }
  return 'Roster';
}

/** NFL and NHL rosters are position groups. NBA is a flat player list. */
export function rosterGroups(athletes) {
  const list = Array.isArray(athletes) ? athletes : [];
  if (list.some((group) => Array.isArray(group?.items))) {
    return list
      .filter((group) => Array.isArray(group?.items) && group.items.length)
      .map((group) => ({ ...group, position: groupLabel(group.position) }));
  }
  const groups = new Map();
  for (const player of list) {
    const label = groupLabel(player?.position);
    if (!groups.has(label)) groups.set(label, { position: label, items: [] });
    groups.get(label).items.push(player);
  }
  return [...groups.values()];
}

export async function getTeamRoster(sport, teamId) {
  const { league } = SPORTS[sport];
  const { data } = await axios.get(`${WEB}/${league}/teams/${teamId}/roster`);
  return rosterGroups(data.athletes || []);
}

export function leadersSeasonYear(sport, now = new Date()) {
  if (sport === 'nhl') return nhlSeasonYear(now);
  return new Date(now).getFullYear();
}

export async function getStatLeaders(sport) {
  const coreLeague = { nba: 'basketball/leagues/nba', nfl: 'football/leagues/nfl', mlb: 'baseball/leagues/mlb', nhl: 'hockey/leagues/nhl' }[sport];
  const year = leadersSeasonYear(sport);
  // Try the current season, then the one before it when that slate is empty.
  const tryYear = async (y) => {
    const { data } = await axios.get(
      `https://sports.core.api.espn.com/v2/sports/${coreLeague}/seasons/${y}/types/2/leaders`
    );
    if (data.categories?.length) return data;
    throw new Error('no data');
  };
  try { return await tryYear(year); }
  catch { return await tryYear(year - 1); }
}

export async function getAthleteInfo(sport, athleteId) {
  const { league } = SPORTS[sport];
  const { data } = await axios.get(
    `https://site.web.api.espn.com/apis/common/v3/sports/${league}/athletes/${athleteId}`
  );
  const a = data.athlete || {};
  return {
    id: athleteId,
    displayName: a.displayName || a.fullName || '',
    shortName: a.shortName || a.displayName || '',
    headshot: a.headshot?.href || `https://a.espncdn.com/i/headshots/${league.split('/')[0]}/players/full/${athleteId}.png`,
    team: a.team?.abbreviation || '',
    teamLogo: a.team?.logos?.[0]?.href || '',
    position: a.position?.abbreviation || '',
  };
}

export async function getPlayerSplits(sport, playerId, year) {
  const { league } = SPORTS[sport];
  const { data } = await axios.get(
    `https://site.web.api.espn.com/apis/common/v3/sports/${league}/athletes/${playerId}/splits?season=${year}`
  );
  return data;
}

function easternYearMonth(now) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(now);
  const value = (type) => Number(parts.find((part) => part.type === type).value);
  return { year: value('year'), month: value('month') };
}

/** NHL seasons are named for the year they end. In October 2026 that is 2027. */
export function nhlSeasonYear(now = new Date()) {
  const { year, month } = easternYearMonth(now);
  return month >= 9 ? year + 1 : year;
}

/**
 * ESPN season id for the season the homepage player cards should show.
 * NHL and NBA ids are the year the season ends. The NFL id stays on the
 * season that started in September until March.
 */
export function activeSeasonYear(sport, now = new Date()) {
  if (sport === 'nhl') return nhlSeasonYear(now);
  const { year, month } = easternYearMonth(now);
  if (sport === 'nba') return month >= 10 ? year + 1 : year;
  if (sport === 'nfl') return month >= 9 ? year : year - 1;
  return year;
}

/** Per-game NBA averages. The feed repeats PTS/REB/AST/STL/BLK for totals and per-48. */
export function nbaSeasonAverages(categories) {
  const byName = {};
  for (const cat of categories || []) {
    for (const stat of cat.stats || []) {
      if (stat?.name && byName[stat.name] == null) byName[stat.name] = stat.displayValue;
    }
  }
  return {
    PTS: byName.avgPoints ?? null,
    REB: byName.avgRebounds ?? null,
    AST: byName.avgAssists ?? null,
    STL: byName.avgSteals ?? null,
    BLK: byName.avgBlocks ?? null,
    GP: byName.gamesPlayed ?? null,
  };
}

export async function getPlayerGameLog(sport, playerId, year) {
  const { league } = SPORTS[sport];
  const season = year || activeSeasonYear(sport);
  const { data } = await axios.get(
    `https://site.web.api.espn.com/apis/common/v3/sports/${league}/athletes/${playerId}/gamelog?season=${season}`
  );
  return data;
}

export async function getPlayerBio(sport, playerId) {
  const { league } = SPORTS[sport];
  const { data } = await axios.get(
    `https://site.web.api.espn.com/apis/common/v3/sports/${league}/athletes/${playerId}`
  );
  return data;
}

export async function getAthleteStats(sport, playerId) {
  const { league } = SPORTS[sport];
  const { data } = await axios.get(
    `https://site.web.api.espn.com/apis/common/v3/sports/${league}/athletes/${playerId}/stats`
  );
  return data;
}

export async function getPlayerSeasonStats(sport, playerId, year) {
  const coreLeague = { nba: 'basketball/leagues/nba', nfl: 'football/leagues/nfl', mlb: 'baseball/leagues/mlb', nhl: 'hockey/leagues/nhl' }[sport];
  const { data } = await axios.get(
    `https://sports.core.api.espn.com/v2/sports/${coreLeague}/seasons/${year}/types/2/athletes/${playerId}/statistics/0`
  );
  return { year, data };
}

export async function getPlayerStats(sport, playerId) {
  const coreLeague = {
    nba: 'basketball/leagues/nba',
    nfl: 'football/leagues/nfl',
    mlb: 'baseball/leagues/mlb',
    nhl: 'hockey/leagues/nhl',
  }[sport];
  const year = activeSeasonYear(sport);

  const tryYear = async (y) => {
    const { data } = await axios.get(
      `https://sports.core.api.espn.com/v2/sports/${coreLeague}/seasons/${y}/types/2/athletes/${playerId}/statistics/0`
    );
    const cats = data?.splits?.categories || [];
    const hasData = cats.some((c) => (c.stats || []).some((s) => parseFloat(s.displayValue) > 0));
    if (!hasData) throw new Error('no data');
    return data;
  };

  const load = async (y) => {
    const data = await tryYear(y);
    if (sport !== 'nba') return data;
    return { _merged: nbaSeasonAverages(data?.splits?.categories), splits: { categories: [] } };
  };

  try { return await load(year); }
  catch { return await load(year - 1); }
}

export async function searchTeams(sport, query) {
  const { league } = SPORTS[sport];
  const { data } = await axios.get(
    `https://site.web.api.espn.com/apis/v2/sports/${league}/standings`
  );
  const teams = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    const entries = node.standings?.entries || node.entries;
    if (Array.isArray(entries)) {
      entries.forEach((e) => { if (e.team?.id) teams.push(e.team); });
    }
    (node.children || []).forEach(walk);
  };
  walk(data);
  const unique = Array.from(new Map(teams.map((t) => [t.id, t])).values());
  // Sort alphabetically by city/location
  unique.sort((a, b) => {
    const cityA = (a.location || a.displayName || '').toLowerCase();
    const cityB = (b.location || b.displayName || '').toLowerCase();
    return cityA.localeCompare(cityB);
  });
  if (!query) return unique;
  return unique.filter((t) => t.displayName.toLowerCase().includes(query.toLowerCase()));
}

export async function getTeamSchedule(sport, teamId) {
  const { league } = SPORTS[sport];
  const { data } = await axios.get(`${WEB}/${league}/teams/${teamId}/schedule`);
  return data.events || [];
}

export async function getGameBoxscore(sport, gameId) {
  const { league } = SPORTS[sport];
  const { data } = await axios.get(
    `${BASE}/${league}/summary?event=${gameId}`
  );
  return data;
}

export async function getTeamInfo(sport, teamId) {
  const coreLeague = { nba: 'basketball/leagues/nba', nfl: 'football/leagues/nfl', mlb: 'baseball/leagues/mlb', nhl: 'hockey/leagues/nhl' }[sport];
  const { league } = SPORTS[sport];
  const year = activeSeasonYear(sport);
  const [coreRes, scheduleRes, recordRes] = await Promise.allSettled([
    axios.get(`https://sports.core.api.espn.com/v2/sports/${coreLeague}/teams/${teamId}?lang=en&region=us`),
    axios.get(`${WEB}/${league}/teams/${teamId}/schedule`),
    axios.get(`https://sports.core.api.espn.com/v2/sports/${coreLeague}/seasons/${year}/types/2/teams/${teamId}/record?lang=en&region=us`),
  ]);
  const team = coreRes.status === 'fulfilled' ? { ...(coreRes.value.data || {}) } : {};
  const scheduleTeam = scheduleRes.status === 'fulfilled' ? scheduleRes.value.data?.team : null;
  if (!team.displayName && scheduleTeam) Object.assign(team, scheduleTeam);
  if (scheduleTeam?.standingSummary) team.standingSummary = scheduleTeam.standingSummary;
  if (!team.logos?.length && (team.logo || scheduleTeam?.logo)) {
    team.logos = [{ href: team.logo || scheduleTeam.logo }];
  }
  const summary = recordRes.status === 'fulfilled'
    ? recordRes.value.data?.items?.find((item) => item.type === 'total')?.summary
    : null;
  if (summary) team.record = { items: [{ summary }] };
  if (!team.displayName && !team.name) throw new Error('no team');
  return team;
}

export async function getTeamNews(sport, teamId, limit = 10) {
  const { league } = SPORTS[sport];
  const { data } = await axios.get(`${WEB}/${league}/news?team=${teamId}&limit=${limit}`);
  return data.articles || [];
}

export async function getTeamDepthChart(sport, teamId) {
  const { league } = SPORTS[sport];
  const { data } = await axios.get(
    `${WEB}/${league}/teams/${teamId}/depthcharts?lang=en`
  );
  return data;
}

export async function getStandings(sport, level = 3) {
  const { league } = SPORTS[sport];
  const year = new Date().getFullYear();
  const tryYear = async (y) => {
    const params = `level=${level}${sport === 'nfl' ? `&season=${y}` : ''}`;
    const { data } = await axios.get(
      `https://site.web.api.espn.com/apis/v2/sports/${league}/standings?${params}`
    );
    return data;
  };
  try { return await tryYear(year); }
  catch { return await tryYear(year - 1); }
}
